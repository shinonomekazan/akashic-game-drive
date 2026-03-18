import { CRUDHandler, DetailHandler } from "../handlers/types";
import * as bootstrap from "bootstrap";
import { formatTimestamp } from "../utils";
import { CallApiError } from "../api/client";

export function createButton(type: "button" | "submit" | "reset", text: string) {
	const tag = document.createElement("button");
	tag.type = type;
	tag.classList.add("btn");
	tag.textContent = text;
	return tag;
}

export function createEditButton(text?: string) {
	const button = createButton("button", text ?? "編集");
	button.classList.add("btn-secondary", "editButton");
	return button;
}

export function createDeleteButton(text?: string) {
	const button = createButton("button", text ?? "削除");
	button.classList.add("btn-danger", "deleteButton");
	return button;
}

export function createActionColumn(buttons: HTMLButtonElement[]) {
	const action = document.createElement("td");
	buttons.forEach((button) => {
		button.classList.add("me-2");
		action.appendChild(button);
	});
	return action;
}

export function createBasicActionColumn() {
	return createActionColumn([createEditButton(), createDeleteButton()]);
}

export function attachDetailHandler(parent: HTMLElement, handler: DetailHandler) {
	const mode = "detail";
	const modalElement = document.querySelector<HTMLElement>(`#${mode}Modal`);
	if (modalElement == null) {
		return;
	}

	const form = modalElement.querySelector<HTMLFormElement>(`#${mode}Form`);
	if (form == null) {
		throw new Error(`${mode}にフォームがありません。`);
	}

	const openDetailModal = (id: string) => {
		return handleOpenModeModal(mode, modalElement, form, handler, id);
	};

	parent.querySelectorAll("tr").forEach((tr) => {
		tr.querySelectorAll("td").forEach((td) => {
			if (td.querySelector("input, textarea, select, button") != null) return;
			td.addEventListener("click", () => {
				const id = tr.dataset.id!;
				openDetailModal(id);
			});
		});
	});

	return openDetailModal;
}

export async function handleOpenModeModal(
	mode: string,
	modalElement: HTMLElement,
	form: HTMLFormElement,
	handler: DetailHandler | CRUDHandler,
	id?: string,
) {
	const modal = getOrCreateModal(modalElement);
	switch (mode) {
		case "edit":
			if (id == null) throw new Error("IDが無い状態でEditが呼び出されました");
			await (handler as CRUDHandler).onEdit(form, id);
			break;
		case "delete":
			if (id == null) throw new Error("IDが無い状態でDeleteが呼び出されました");
			await (handler as CRUDHandler).onDelete(form, id);
			break;
		case "detail":
			if (id == null) throw new Error("IDが無い状態でDetailが呼び出されました");
			await (handler as DetailHandler).onDetail(form, id);
			break;
		default:
			console.warn(`未定義モード: ${mode}でhandleOpenModeModalが呼び出されています。`);
			break;
	}
	const closeHandler = () => {
		modalElement.removeEventListener("hidden.bs.modal", closeHandler);
		if (handler.onCloseModal != null) {
			handler.onCloseModal(mode);
		}
	};
	modalElement.addEventListener("hidden.bs.modal", closeHandler);
	modal.show();
}

export const formModals: {
	[key: string]: bootstrap.Modal;
} = {};

export function getOrCreateModal(modalElement: HTMLElement) {
	const id = modalElement.id;
	if (Object.prototype.hasOwnProperty.call(formModals, id)) {
		return formModals[id];
	}
	formModals[id] = new bootstrap.Modal(modalElement);
	return formModals[id];
}

export function getQueryParam(key: string) {
	const params = new URLSearchParams(location.search);
	return params.get(key);
}

export function closeAllModal() {
	document.querySelectorAll<HTMLElement>(".modal").forEach((modalElement) => {
		if (modalElement.classList.contains("show")) {
			const modal = getOrCreateModal(modalElement);
			modal.hide();
		}
	});
}

export function attachIdDetailStateHandler(openDetailModal: (id: string) => any) {
	const changeState = () => {
		const idParam = getQueryParam("id");
		if (idParam == null) {
			closeAllModal();
		} else if (idParam != null && openDetailModal != null) {
			openDetailModal(idParam);
		}
	};

	window.addEventListener("popstate", () => {
		changeState();
	});
	changeState();
}

export function pushQueryState(params: { [key: string]: string | undefined }) {
	const url = new URL(window.location.href);
	let isChanged: boolean = false;
	let dataState = {};
	Object.keys(params).forEach((key) => {
		// nullとundefinedの比較用にあえて != で
		if (url.searchParams.get(key) != params[key]) {
			isChanged = true;
		}
		const value = params[key];

		if (value == null) {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, value);
		}
	});
	dataState = params;
	if (isChanged) {
		history.pushState(dataState, "", url);
	}
}

export function setFormValuesByPropsWithTimeConvert<T>(form: HTMLFormElement, model: T, props: (keyof T)[]) {
	props.forEach((prop) => {
		const propName = String(prop);
		const input = form.querySelector<HTMLInputElement>(
			`input[name=${propName}], select[name=${propName}], textarea[name=${propName}]`,
		);
		if (input == null) {
			throw new Error(`${propName}要素が存在しません`);
		}
		if (["createdAt", "updatedAt", "startedAt", "usedAt", "holdingAt"].includes(`${propName}`)) {
			input.value = model[prop] ? formatTimestamp(model[prop]) : "";
			return;
		}
		input.value = `${model[prop] ?? ""}`;
	});
}

export function createTextTag(tagName: string, text: string) {
	const tag = document.createElement(tagName);
	tag.textContent = text;
	return tag;
}

export function createTextTd(text: string) {
	return createTextTag("td", text);
}

export function formToObject<T>(form: HTMLFormElement, selectFnumber?: string[]) {
	const formData = new FormData(form);
	const values = Object.fromEntries(formData) as any;
	for (const entry of formData.entries()) {
		const inputElement = form[entry[0]] as HTMLInputElement;
		if (entry[1] === "") {
			const nullable = inputElement.classList.contains("nullable");
			if (nullable) {
				values[entry[0]] = null;
			}
		}
		if (inputElement.type === "number" && entry[1] !== "") {
			values[entry[0]] = Number(entry[1]);
		}
		if (selectFnumber) {
			if (inputElement.tagName === "SELECT" && entry[1] !== "") {
				if (selectFnumber.includes(inputElement.name)) {
					values[entry[0]] = Number(entry[1]);
				} else {
					values[entry[0]] = entry[1];
				}
			}
		}
	}
	return values as any as T;
}

export function resetBtn<T extends HTMLElement>(el: T): T {
	const clone = el.cloneNode(true) as T;
	el.replaceWith(clone);
	return clone;
}

export function attachCRUDButtonHandler(parent: HTMLElement, handler: CRUDHandler) {
	["edit", "delete", "append"].forEach((mode) => {
		const modalElement = document.querySelector<HTMLElement>(`#${mode}Modal`);
		if (modalElement == null) {
			return;
		}

		const form = modalElement.querySelector<HTMLFormElement>(`#${mode}Form`);
		if (form == null) {
			throw new Error(`${mode}にフォームがありません。`);
		}

		const buttons = parent.querySelectorAll(`.${mode}Button`);
		buttons.forEach((button) => {
			button.addEventListener("click", () => {
				if (button.parentElement?.tagName === "TD") {
					const tr = button.parentElement.parentElement;
					const id = tr?.dataset.id;
					handleOpenModeModal(mode, modalElement, form, handler, id);
				} else {
					handleOpenModeModal(mode, modalElement, form, handler);
				}
			});
		});
	});
}

export async function attachCRUDHandler(parent: HTMLElement, handler: CRUDHandler) {
	["edit", "delete", "append"].forEach((mode) => {
		const modalElement = document.querySelector<HTMLElement>(`#${mode}Modal`);
		if (modalElement == null) {
			return;
		}
		const modal = getOrCreateModal(modalElement);
		const form = modalElement.querySelector<HTMLFormElement>(`#${mode}Form`);
		if (form == null) {
			throw new Error(`${mode}にフォームがありません。`);
		}

		const closeHandler = () => {
			modalElement.removeEventListener("hidden.bs.modal", closeHandler);
			if (handler.onCloseModal != null) {
				handler.onCloseModal(mode);
			}
		};
		modalElement.addEventListener("hidden.bs.modal", closeHandler);

		form.addEventListener("submit", async (e) => {
			e.preventDefault();
			try {
				switch (mode) {
					case "edit":
						if ((await handler.onSubmitEdit(form)) === false) return;
						break;
					case "append":
						if ((await handler.onSubmitAppend(form)) === false) return;
						break;
					case "delete":
						if ((await handler.onSubmitDelete(form)) === false) return;
						break;
					default:
						console.warn(`未定義モード: ${mode}でformがsubmitされました。`);
						break;
				}
			} catch (error) {
				alert(`${(error as CallApiError).message}`);
			}
			modal.hide();
		});
	});

	attachCRUDButtonHandler(parent, handler);
}
