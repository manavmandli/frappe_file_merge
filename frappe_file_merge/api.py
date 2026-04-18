import io
import base64

import frappe
from frappe import _
from frappe.utils.file_manager import save_file
from PIL import Image
from pypdf import PdfReader, PdfWriter


def _build_pdf(files):
	writer = PdfWriter()
	for f in files:
		raw = f.get("data", "")
		if "," in raw:
			raw = raw.split(",", 1)[1]
		data = base64.b64decode(raw)
		mime = f.get("type", "")

		if mime.startswith("image/"):
			img = Image.open(io.BytesIO(data))
			if img.mode in ("RGBA", "P", "LA"):
				img = img.convert("RGB")
			buf = io.BytesIO()
			img.save(buf, format="PDF")
			buf.seek(0)
			reader = PdfReader(buf)
		else:
			reader = PdfReader(io.BytesIO(data))

		for page in reader.pages:
			writer.add_page(page)

	output = io.BytesIO()
	writer.write(output)
	return output.getvalue()


@frappe.whitelist()
def merge_files(files):
	"""Merge files and return base64-encoded PDF without saving to Frappe."""
	files = frappe.parse_json(files)
	if not files:
		frappe.throw(_("No files provided."))
	return base64.b64encode(_build_pdf(files)).decode()


@frappe.whitelist()
def merge_and_upload(files, filename, doctype=None, docname=None, fieldname=None, folder="Home", is_private=0):
	files = frappe.parse_json(files)

	if not files:
		frappe.throw(_("No files provided for merging."))

	if not filename.endswith(".pdf"):
		filename += ".pdf"

	file_doc = save_file(
		fname=filename,
		content=_build_pdf(files),
		dt=doctype or "",
		dn=docname or "",
		df=fieldname,
		folder=folder,
		is_private=frappe.utils.cint(is_private),
	)

	return file_doc.as_dict()
