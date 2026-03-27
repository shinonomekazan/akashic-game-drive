export interface DetailHandler {
	onDetail(form: HTMLFormElement, id: string): Promise<void>;
	onCloseModal?(mode: string): void;
}

export interface CRUDHandler {
	onEdit(form: HTMLFormElement, id: string): Promise<void>;
	onAppend(form: HTMLFormElement): Promise<void>;
	onDelete(form: HTMLFormElement, id: string): Promise<void>;
	onSubmitEdit(form: HTMLFormElement): Promise<void | false>;
	onSubmitDelete(form: HTMLFormElement): Promise<void | false>;
	onSubmitAppend(form: HTMLFormElement): Promise<void | false>;
	onCloseModal?(mode: string): void;
}
