
import ViteExpress from 'vite-express';
import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import express from 'express';

import type { Request, Response, NextFunction } from 'express';

import { doubleCsrf } from 'csrf-csrf';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { WorkOS } from '@workos-inc/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;
const workos = new WorkOS(process.env.WORKOS_API_KEY, {
	clientId: process.env.WORKOS_CLIENT_ID
})

app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
	getSecret: () => process.env.CSRF_SECRET,
	getSessionIdentifier: (req) => req.cookies['wos-session'] ?? '',
	cookieName: 'x-csrf-token',
    cookieOptions: {
        secure: false,
        sameSite: 'lax'
    },
	size: 64,
	getCsrfTokenFromRequest: (req) => req.body._csrf || req.headers['x-csrf-token']
})

async function withAuth(req: Request, res: Response, next: NextFunction) {
	const session = workos.userManagement.loadSealedSession({
		sessionData: req.cookies['wos-session'],
		cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
	})

	const authResult = await session.authenticate() as any;

	if (authResult.authenticated) {
		return next();
	}
	// if cookie is missing, redirect to login
	if (!authResult.authenticated && authResult.reason === 'no_session_cookie_provided') {
		return res.redirect('/login');
	}
	// if session is invalid, attempt to refresh
	try {
		const refreshResult = await session.refresh();
		if (!refreshResult.authenticated) {
			return res.redirect('/login');
		}

		res.cookie('wos-session', refreshResult.sealedSession, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax'
		})

		return res.redirect(req.originalUrl);
	} catch (error) {
		res.clearCookie('wos-session');
		res.redirect('/login')
	}
}

// endpoint to get csrf token for forms
app.get('/csrf-token', (req, res) => {
	const csrfToken = generateCsrfToken(req, res);
	res.json({ csrfToken });
})

app.post('/logout', doubleCsrfProtection, async (req, res) => {
	const session = workos.userManagement.loadSealedSession({
		sessionData: req.cookies['wos-session'],
		cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
	})
	const url = await session.getLogoutUrl();
	res.clearCookie('wos-session');
	res.redirect(url);
})

app.get('/dashboard', withAuth, async (req, res) => {
	const session = workos.userManagement.loadSealedSession({
		sessionData: req.cookies['wos-session'],
		cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
	})
	const authResult = await session.authenticate() as any;
	if (!authResult) {
		return res.redirect('/login');
	}
	console.log(`User ${authResult.user.firstName} is logged in`);
})

app.get('/callback', async (req, res) => {
	const code = req.query.code as string;
	if (!code) {
		return res.status(400).send('No code provided');
	}

	try {
		const authenticateResponse =
			await workos.userManagement.authenticateWithCode({
				clientId: process.env.WORKOS_CLIENT_ID,
				code,
				session: {
					sealSession: true,
					cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
				}
			})
		const { sealedSession } = authenticateResponse;

		// store session in a cookie
		res.cookie('wos-session', sealedSession, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax'
		})

		return res.redirect('/');
	} catch (error) {
		return res.redirect('login');
	}
})

app.get('/login', (_req, res) => {

	const authUrl: string = workos.userManagement.getAuthorizationUrl({
		provider: 'authkit',
		redirectUri: 'http://localhost:3000/callback',
		clientId: process.env.WORKOS_CLIENT_ID,
	})
	res.redirect(authUrl);
})

app.get('/', async (req, res) => {
	let user = null;

	try {
		const session = workos.userManagement.loadSealedSession({
			sessionData: req.cookies['wos-session'],
			cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
		})

		const authResult = await session.authenticate();
		if (authResult.authenticated) {
			user = authResult.user;
		}
	} catch (error) {}

	let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

	if (user) {
		const csrfToken = generateCsrfToken(req, res);

		html = html.replace('{{USER_DATA}}', `
		   <div class="user-info">
			  <span class="name">Signed in as: ${user.firstName}</span>
			  <form action="/logout" method="POST">
				 <input type="hidden" name="_csrf" value="${csrfToken}" />
				 <button type="submit" class="logout-link">Logout</button>
			  </form>
		   </div>
		`);
		html = html.replace('{{AUTH_BUTTONS}}', '');
	} else {
		html = html.replace('{{USER_DATA}}', '');
		html = html.replace('{{AUTH_BUTTONS}}', `
		   <form action="/login" method="GET">
			  <button type="submit">Sign in to profile</button>
		   </form>
		`);
	}

	res.send(html);
})

ViteExpress.listen(app, port, () => {
	console.log(`Server running on port ${port}`)
})
