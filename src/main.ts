
fetch('/csrf-token')
	.then((r) => r.json())
	.then((data) => {
		const csrfInput = document.getElementById('csrf-token') as HTMLInputElement;
		if (csrfInput) {
			csrfInput.value = data.csrfToken;
		}
	})

const MAX_SIZE_MB = 100;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const dragArea = document.getElementById('drag-area') as HTMLDivElement;
const uploadTrigger = document.getElementById('upload-trigger') as HTMLSpanElement;

const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileStatus = document.getElementById('file-status') as HTMLParagraphElement;

function formatBytes(bytes: number): string {
	if (bytes === 0) return;

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function handleFiles(files: FileList) {
	if (files.length === 0) return;
	const fileArray = Array.from(files);

	const totalBytes = fileArray.reduce((acc, file) => acc + file.size, 0);
	const formattedSize = formatBytes(totalBytes);

	// file size limit
	if (totalBytes > MAX_SIZE_BYTES) {
		fileStatus.innerText = 'Error: Total size exceeds 100MB limit';
		fileStatus.style.color = '#FF7388';
		return;
	}
	else {
		fileStatus.style.color = '#AAAFBE';
	}

	// display number of files
	if (files.length === 1) {
        fileStatus.innerText = `File selected: ${fileArray[0].name} (${formattedSize})`;
		console.log('File received:', fileArray[0].name);
    } else {
        fileStatus.innerText = `${fileArray.length} Files selected (Total: ${formattedSize})`;
		console.log('Files received:', fileArray.map(file => file.name));
    }
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventType => {
	dragArea.addEventListener(eventType, (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, false);
});

['dragenter', 'dragover'].forEach(eventType => {
	dragArea.addEventListener(eventType, () => dragArea.classList.add('is-hovered'));
});

['dragleave', 'drop'].forEach(eventType => {
	dragArea.addEventListener(eventType, () => dragArea.classList.remove('is-hovered'));
});

dragArea.addEventListener('drop', (e: DragEvent) => {
	if (e.dataTransfer && e.dataTransfer.files.length > 0) {
		handleFiles(e.dataTransfer.files);
	}
})

uploadTrigger.addEventListener('click', () => {
	fileInput.click();
})

fileInput.addEventListener('change', (e: Event) => {
	const target = e.target as HTMLInputElement;

	if (target.files) {
		handleFiles(target.files);
	}
})