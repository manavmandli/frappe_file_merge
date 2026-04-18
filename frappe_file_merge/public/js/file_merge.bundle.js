import { createApp } from "vue";
import FileMergeDialog from "./components/FileMergeDialog.vue";

function enter_merge_mode(wrapper, fu_instance) {
	const dialog = fu_instance.dialog;
	const uploader_el = wrapper.querySelector(".file-uploader");
	if (!uploader_el) return;

	// Hide the uploader content — merge UI occupies the same dialog body
	uploader_el.style.display = "none";

	const merge_container = document.createElement("div");
	wrapper.appendChild(merge_container);

	const uploader_props = fu_instance.uploader?.$props || {};

	const merge_app = createApp(FileMergeDialog, {
		doctype: uploader_props.doctype || null,
		docname: uploader_props.docname || null,
		fieldname: uploader_props.fieldname || null,
		folder: uploader_props.folder || "Home",
		is_private: !(uploader_props.make_attachments_public),
	});
	SetVueGlobals(merge_app);
	const merge_vm = merge_app.mount(merge_container);

	function restore() {
		merge_app.unmount();
		merge_container.remove();
		uploader_el.style.display = "";
		dialog.custom_actions.empty();
		dialog.set_title(__("Upload"));
		dialog.set_primary_action(__("Upload"), () => fu_instance.upload_files());
		dialog.get_primary_btn().prop("disabled", false);
		dialog.set_secondary_action_label(__("Set all private"));
		dialog.set_secondary_action(() => fu_instance.uploader.toggle_all_private());
	}

	dialog.set_title(__("Merge Files into PDF"));

	dialog.set_primary_action(__("Merge"), async () => {
		const btn = dialog.get_primary_btn();
		btn.prop("disabled", true).html(__("Merging…"));
		let did_restore = false;
		try {
			const file_obj = await merge_vm.merge();
			if (!file_obj) return;

			const restrictions = fu_instance.uploader?.$props?.restrictions || {};
			const max_size = restrictions.max_file_size;
			if (max_size && file_obj.size > max_size) {
				frappe.show_alert({
					message: __("Merged file size ({0} MB) exceeds the allowed maximum of {1} MB.", [
						(file_obj.size / 1048576).toFixed(2),
						(max_size / 1048576).toFixed(0),
					]),
					indicator: "red",
				});
				return;
			}

			did_restore = true;
			restore();

			const is_private = !(fu_instance.uploader?.$props?.make_attachments_public);
			fu_instance.uploader.files.push({
				file_obj,
				cropper_file: file_obj,
				crop_box_data: null,
				optimize: false,
				name: file_obj.name,
				doc: null,
				progress: 0,
				total: 0,
				failed: false,
				request_succeeded: false,
				error_message: null,
				uploading: false,
				private: is_private,
			});
		} finally {
			if (!did_restore) {
				btn.prop("disabled", false).html(__("Merge"));
			}
		}
	});

	dialog.set_secondary_action_label(__("Back"));
	dialog.set_secondary_action(restore);

	dialog.add_custom_action(__("Preview"), async () => {
		const preview_btn = dialog.custom_actions.find(".btn");
		preview_btn.prop("disabled", true);
		try {
			await merge_vm.preview();
		} finally {
			preview_btn.prop("disabled", false);
		}
	});
}

function inject_merge_button(wrapper, fu_instance) {
	const btn_area = wrapper.querySelector(".file-upload-area .mt-3.text-center");
	if (!btn_area || btn_area.querySelector(".btn-file-merge")) return;

	const btn = document.createElement("button");
	btn.className = "btn btn-file-upload btn-file-merge";
	btn.innerHTML = `
		<svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
			<circle cx="15" cy="15" r="15" fill="var(--subtle-fg)"/>
			<rect x="8" y="8" width="6" height="8" rx="1" stroke="var(--text-color)"/>
			<rect x="16" y="8" width="6" height="8" rx="1" stroke="var(--text-color)"/>
			<path d="M15 18v4" stroke="var(--text-color)" stroke-linecap="round"/>
			<path d="M12.5 20.5L15 23l2.5-2.5" stroke="var(--text-color)" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		<div class="mt-1">${__("Merge")}</div>
	`;
	btn.addEventListener("click", () => enter_merge_mode(wrapper, fu_instance));
	btn_area.appendChild(btn);
}

function patch_file_uploader() {
	if (!frappe.ui?.FileUploader || frappe.ui.FileUploader._merge_patched) return;

	const _orig = frappe.ui.FileUploader.prototype.make_dialog;

	frappe.ui.FileUploader.prototype.make_dialog = function (title) {
		_orig.call(this, title);
		const fu_instance = this;
		this.dialog.$wrapper.one("shown.bs.modal", () => {
			inject_merge_button(fu_instance.wrapper, fu_instance);
		});
	};

	frappe.ui.FileUploader._merge_patched = true;
}

frappe.require("file_uploader.bundle.js", () => {
	patch_file_uploader();
});


frappe.require("file_uploader.bundle.js", () => {
	patch_file_uploader();
});
