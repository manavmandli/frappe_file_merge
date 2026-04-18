<template>
	<div class="file-merge-wrapper">
		<template v-if="!crop_target">
			<div
				class="merge-drop-zone"
				:class="{ active: is_dragging }"
				@dragover.prevent="is_dragging = true"
				@dragleave.prevent="is_dragging = false"
				@drop.prevent="on_drop"
				@click="$refs.file_input.click()"
			>
				<input
					ref="file_input"
					type="file"
					class="hidden"
					multiple
					accept="image/*,.pdf"
					@change="on_file_input"
				/>
				<div class="drop-zone-icon" v-html="frappe.utils.icon('upload', 'xl')"></div>
				<p class="drop-zone-label">{{ __("Click or drop files here") }}</p>
				<p class="drop-zone-hint">{{ __("Supports PDF and images (JPG, PNG, TIFF, etc.)") }}</p>
			</div>

			<template v-if="files.length">
				<div class="merge-list-header">
					<span class="merge-list-hint">{{ __("Drag to reorder — files merge top to bottom") }}</span>
					<span class="badge badge-pill badge-primary">{{ files.length }}</span>
				</div>
				<div ref="sortable_el" class="merge-file-list">
					<MergeFileItem
						v-for="file in files"
						:key="file.id"
						:file="file"
						@remove="remove_file(file.id)"
						@crop="open_cropper(file)"
					/>
				</div>
				<div class="merge-output-row">
					<label class="merge-output-label">{{ __("Output filename") }}</label>
					<div class="input-group">
						<input
							v-model="output_filename"
							class="form-control"
							type="text"
							placeholder="merged_document"
						/>
						<div class="input-group-append">
							<span class="input-group-text">.pdf</span>
						</div>
					</div>
				</div>
			</template>

			<div v-if="error_msg" class="alert alert-danger mt-3 mb-0" role="alert">
				{{ error_msg }}
			</div>
		</template>

		<ImageCropper
			v-else
			:file="crop_target"
			:fixed_aspect_ratio="null"
			@toggle_image_cropper="close_cropper"
		/>
	</div>
</template>

<script setup>
import { ref } from "vue";
import MergeFileItem from "./MergeFileItem.vue";
import ImageCropper from "../../../../../frappe/frappe/public/js/frappe/file_uploader/ImageCropper.vue";

defineProps({
	doctype: { default: null },
	docname: { default: null },
	fieldname: { default: null },
	folder: { default: "Home" },
	is_private: { default: 1 },
});

const file_input = ref(null);
const sortable_el = ref(null);
const files = ref([]);
const is_dragging = ref(false);
const output_filename = ref("merged_document");
const error_msg = ref(null);
const crop_target = ref(null);

let id_seq = 0;
let sortable = null;

function init_sortable() {
	if (!window.Sortable || !sortable_el.value || sortable) return;
	sortable = new window.Sortable(sortable_el.value, {
		animation: 150,
		handle: ".drag-handle",
		onEnd(evt) {
			const moved = files.value.splice(evt.oldIndex, 1)[0];
			files.value.splice(evt.newIndex, 0, moved);
		},
	});
}

function on_file_input(e) {
	add_files(e.target.files);
	e.target.value = "";
}

function on_drop(e) {
	is_dragging.value = false;
	add_files(e.dataTransfer.files);
}

function add_files(file_list) {
	const added = Array.from(file_list)
		.filter((f) => {
			const ok = f.type === "application/pdf" || f.type.startsWith("image/");
			if (!ok) {
				frappe.show_alert({
					message: __('"{0}" is not supported. Use PDF or image files.', [f.name]),
					indicator: "orange",
				});
			}
			return ok;
		})
		.map((f) => {
			const item = {
				id: ++id_seq,
				file_obj: f,
				cropper_file: f,
				crop_box_data: null,
				name: f.name,
				type: f.type,
				size: f.size,
				preview: null,
			};
			if (f.type.startsWith("image/")) {
				const reader = new FileReader();
				reader.onload = (e) => (item.preview = e.target.result);
				reader.readAsDataURL(f);
			}
			return item;
		});

	files.value = files.value.concat(added);
	setTimeout(() => init_sortable(), 0);
}

function remove_file(id) {
	files.value = files.value.filter((f) => f.id !== id);
	if (!files.value.length) {
		sortable?.destroy();
		sortable = null;
	}
}

function open_cropper(file) {
	crop_target.value = file;
}

function close_cropper() {
	const file = crop_target.value;
	crop_target.value = null;
	if (file && file.file_obj.type.startsWith("image/")) {
		const reader = new FileReader();
		reader.onload = (e) => (file.preview = e.target.result);
		reader.readAsDataURL(file.file_obj);
	}
}

async function serialize() {
	return Promise.all(
		files.value.map(
			(f) =>
				new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = (e) => resolve({ data: e.target.result, type: f.type, name: f.name });
					reader.onerror = reject;
					reader.readAsDataURL(f.file_obj);
				})
		)
	);
}

async function merge() {
	if (!files.value.length) {
		frappe.show_alert({ message: __("Please select at least one file."), indicator: "orange" });
		return null;
	}
	error_msg.value = null;
	try {
		const serialized = await serialize();
		const r = await frappe.call({
			method: "frappe_file_merge.api.merge_files",
			args: { files: serialized },
		});
		if (!r.message) return null;

		const name = (output_filename.value || "merged_document") + ".pdf";
		const bytes = Uint8Array.from(atob(r.message), (c) => c.charCodeAt(0));
		return new File([bytes], name, { type: "application/pdf" });
	} catch (e) {
		error_msg.value = e.message || __("Merge failed. Please try again.");
		return null;
	}
}

async function preview() {
	if (!files.value.length) {
		frappe.show_alert({ message: __("Please select at least one file."), indicator: "orange" });
		return;
	}
	error_msg.value = null;
	try {
		const serialized = await serialize();
		const r = await frappe.call({
			method: "frappe_file_merge.api.merge_files",
			args: { files: serialized },
		});
		if (!r.message) return;

		const bytes = Uint8Array.from(atob(r.message), (c) => c.charCodeAt(0));
		const blob = new Blob([bytes], { type: "application/pdf" });
		const url = URL.createObjectURL(blob);

		const d = new frappe.ui.Dialog({ title: __("Merged PDF Preview"), size: "extra-large" });
		$(d.body).html(
			`<embed src="${url}" type="application/pdf" width="100%" height="520px" style="border:none;" />`
		);
		d.$wrapper.on("hidden.bs.modal", () => URL.revokeObjectURL(url));
		d.show();
	} catch (e) {
		error_msg.value = e.message || __("Preview failed. Please try again.");
	}
}

defineExpose({ merge, preview });
</script>

<style>
.file-merge-wrapper {
	padding: 4px 0;
}

.merge-drop-zone {
	border: 2px dashed var(--border-color);
	border-radius: var(--border-radius-lg);
	padding: 28px 20px;
	text-align: center;
	cursor: pointer;
	transition: background 0.15s ease, border-color 0.15s ease;
	user-select: none;
}

.merge-drop-zone:hover,
.merge-drop-zone.active {
	background: var(--subtle-accent);
	border-color: var(--primary);
}

.drop-zone-icon {
	display: flex;
	justify-content: center;
	margin-bottom: 8px;
}

.drop-zone-label {
	font-weight: 500;
	margin: 0;
}

.drop-zone-hint {
	color: var(--text-muted);
	font-size: 12px;
	margin: 4px 0 0;
}

.merge-list-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin: 16px 0 8px;
}

.merge-list-hint {
	font-size: 12px;
	color: var(--text-muted);
}

.merge-file-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.merge-output-row {
	margin-top: 16px;
}

.merge-output-label {
	font-size: 12px;
	font-weight: 500;
	margin-bottom: 4px;
	display: block;
}

.merge-output-row .input-group {
	flex-wrap: nowrap;
	align-items: stretch;
}

.merge-output-row .input-group .form-control {
	height: auto;
}

.merge-output-row .input-group-text {
	display: flex;
	align-items: center;
	padding-top: 0;
	padding-bottom: 0;
}
</style>


<script setup>
import { ref } from "vue";
import MergeFileItem from "./MergeFileItem.vue";

defineProps({
	doctype: { default: null },
	docname: { default: null },
	fieldname: { default: null },
	folder: { default: "Home" },
	is_private: { default: 1 },
});

const file_input = ref(null);
const sortable_el = ref(null);
const files = ref([]);
const is_dragging = ref(false);
const output_filename = ref("merged_document");
const error_msg = ref(null);

let id_seq = 0;
let sortable = null;

function init_sortable() {
	if (!window.Sortable || !sortable_el.value || sortable) return;
	sortable = new window.Sortable(sortable_el.value, {
		animation: 150,
		handle: ".drag-handle",
		onEnd(evt) {
			const moved = files.value.splice(evt.oldIndex, 1)[0];
			files.value.splice(evt.newIndex, 0, moved);
		},
	});
}

function on_file_input(e) {
	add_files(e.target.files);
	e.target.value = "";
}

function on_drop(e) {
	is_dragging.value = false;
	add_files(e.dataTransfer.files);
}

function add_files(file_list) {
	const added = Array.from(file_list)
		.filter((f) => {
			const ok = f.type === "application/pdf" || f.type.startsWith("image/");
			if (!ok) {
				frappe.show_alert({
					message: __('"{0}" is not supported. Use PDF or image files.', [f.name]),
					indicator: "orange",
				});
			}
			return ok;
		})
		.map((f) => {
			const item = {
				id: ++id_seq,
				file_obj: f,
				name: f.name,
				type: f.type,
				size: f.size,
				preview: null,
			};
			if (f.type.startsWith("image/")) {
				const reader = new FileReader();
				reader.onload = (e) => (item.preview = e.target.result);
				reader.readAsDataURL(f);
			}
			return item;
		});

	files.value = files.value.concat(added);
	setTimeout(() => init_sortable(), 0);
}

function remove_file(id) {
	files.value = files.value.filter((f) => f.id !== id);
	if (!files.value.length) {
		sortable?.destroy();
		sortable = null;
	}
}

function open_cropper(file) {
	const d = new frappe.ui.Dialog({
		title: __("{0} — Crop", [file.name]),
		size: "large",
	});

	d.show();

	const wrapper = d.body;
	wrapper.innerHTML = `<div class="merge-cropper-mount"></div>`;
	const mount_el = wrapper.querySelector(".merge-cropper-mount");

	const crop_app = Vue.createApp(ImageCropperComponent, {
		file: {
			file_obj: file.file_obj,
			cropper_file: file.cropper_file || file.file_obj,
			crop_box_data: file.crop_box_data,
		},
		fixed_aspect_ratio: null,
		onToggleImageCropper() {
			d.hide();
		},
		onUploadAfterCrop() {
			d.hide();
		},
	});
	SetVueGlobals(crop_app);
	crop_app.mount(mount_el);
	d.$wrapper.on("hidden.bs.modal", () => crop_app.unmount());
}

async function serialize() {
	return Promise.all(
		files.value.map(
			(f) =>
				new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = (e) => resolve({ data: e.target.result, type: f.type, name: f.name });
					reader.onerror = reject;
					reader.readAsDataURL(f.file_obj);
				})
		)
	);
}

async function merge() {
	if (!files.value.length) {
		frappe.show_alert({ message: __("Please select at least one file."), indicator: "orange" });
		return null;
	}
	error_msg.value = null;
	try {
		const serialized = await serialize();
		const r = await frappe.call({
			method: "frappe_file_merge.api.merge_files",
			args: { files: serialized },
		});
		if (!r.message) return null;

		const name = (output_filename.value || "merged_document") + ".pdf";
		const bytes = Uint8Array.from(atob(r.message), (c) => c.charCodeAt(0));
		return new File([bytes], name, { type: "application/pdf" });
	} catch (e) {
		error_msg.value = e.message || __("Merge failed. Please try again.");
		return null;
	}
}

async function preview() {
	if (!files.value.length) {
		frappe.show_alert({ message: __("Please select at least one file."), indicator: "orange" });
		return;
	}
	error_msg.value = null;
	try {
		const serialized = await serialize();
		const r = await frappe.call({
			method: "frappe_file_merge.api.merge_files",
			args: { files: serialized },
		});
		if (!r.message) return;

		const bytes = Uint8Array.from(atob(r.message), (c) => c.charCodeAt(0));
		const blob = new Blob([bytes], { type: "application/pdf" });
		const url = URL.createObjectURL(blob);

		const d = new frappe.ui.Dialog({ title: __("Merged PDF Preview"), size: "extra-large" });
		$(d.body).html(
			`<embed src="${url}" type="application/pdf" width="100%" height="520px" style="border:none;" />`
		);
		d.$wrapper.on("hidden.bs.modal", () => URL.revokeObjectURL(url));
		d.show();
	} catch (e) {
		error_msg.value = e.message || __("Preview failed. Please try again.");
	}
}

defineExpose({ merge, preview });
</script>

<style>
.file-merge-wrapper {
	padding: 4px 0;
}

.merge-drop-zone {
	border: 2px dashed var(--border-color);
	border-radius: var(--border-radius-lg);
	padding: 28px 20px;
	text-align: center;
	cursor: pointer;
	transition: background 0.15s ease, border-color 0.15s ease;
	user-select: none;
}

.merge-drop-zone:hover,
.merge-drop-zone.active {
	background: var(--subtle-accent);
	border-color: var(--primary);
}

.drop-zone-icon {
	display: flex;
	justify-content: center;
	margin-bottom: 8px;
}

.drop-zone-label {
	font-weight: 500;
	margin: 0;
}

.drop-zone-hint {
	color: var(--text-muted);
	font-size: 12px;
	margin: 4px 0 0;
}

.merge-list-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin: 16px 0 8px;
}

.merge-list-hint {
	font-size: 12px;
	color: var(--text-muted);
}

.merge-file-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.merge-output-row {
	margin-top: 16px;
}

.merge-output-label {
	font-size: 12px;
	font-weight: 500;
	margin-bottom: 4px;
	display: block;
}

.merge-output-row .input-group {
	flex-wrap: nowrap;
	align-items: stretch;
}

.merge-output-row .input-group .form-control {
	height: auto;
}

.merge-output-row .input-group-text {
	display: flex;
	align-items: center;
	padding-top: 0;
	padding-bottom: 0;
}
</style>

