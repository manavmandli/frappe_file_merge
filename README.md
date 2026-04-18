# Frappe File Merge

Extends Frappe's file attachment dialog with a **Merge** option — select multiple PDFs and images, reorder them, crop images, and attach the result as a single merged PDF.

---

<video controls src="file_merge.webm" title="Title"></video>

---

## Features

- **Merge** button injected into every Frappe upload dialog
- Supports PDF and images (JPG, PNG, TIFF, WebP, etc.)
- Drag-to-reorder files before merging
- Crop images inline before merging
- Thumbnail previews for images
- Configurable output filename

## Installation

```bash
bench get-app frappe_file_merge
bench --site <site> install-app frappe_file_merge
bench build --app frappe_file_merge
```

## License

MIT
