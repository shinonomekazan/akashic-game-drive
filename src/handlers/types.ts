export interface DetailHandler {
	onDetail(form: HTMLFormElement, id: string): Promise<void>;
	onCloseModal?(mode: string): void;
}
