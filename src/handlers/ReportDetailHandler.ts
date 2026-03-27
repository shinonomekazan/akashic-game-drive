import { Firestore } from "firebase/firestore";
import { DetailHandler } from "./types";
import { qsStrict } from "../utils";
import { getOrCreateModal, pushQueryState, resetBtn, setFormValuesByPropsWithTimeConvert } from "../helpers";
import { deleteReport, updateReport } from "../api/manage";
import { Client } from "../api/client";
import { getReport } from "../resolvers/report";

export class ReportDetailHandler extends EventTarget implements DetailHandler {
	firestore: Firestore;
	api: Client;
	refresh: () => Promise<void>;

	constructor(firestore: Firestore, api: Client, refresh: () => Promise<void>) {
		super();
		this.firestore = firestore;
		this.api = api;
		this.refresh = refresh;
	}

	async onDetail(form: HTMLFormElement, id: string): Promise<void> {
		pushQueryState({ id });
		const reportDoc = await getReport(this.firestore, id);
		if (reportDoc == null) {
			window.alert("レポートが見つかりませんでした。");
			return;
		}

		setFormValuesByPropsWithTimeConvert(form, reportDoc, [
			"id",
			"reporterId",
			"contentId",
			"category",
			"description",
			"status",
			"createdAt",
			"updatedAt",
		]);

		const statusSelect = qsStrict<HTMLSelectElement>("select[name=status]", form);
		statusSelect.value = reportDoc.status;

		let editBtn = resetBtn(qsStrict<HTMLButtonElement>("#editBtn"));
		let deleteBtn = resetBtn(qsStrict<HTMLButtonElement>("#deleteBtn"));

		document.getElementById("cancelBtn")?.remove();
		const cancelBtn = document.createElement("button");
		cancelBtn.id = "cancelBtn";
		cancelBtn.type = "button";
		cancelBtn.className = "btn btn-secondary me-3";
		cancelBtn.textContent = "取消";
		cancelBtn.style.display = "none";
		editBtn.insertAdjacentElement("beforebegin", cancelBtn);

		const setViewMode = () => {
			editBtn.classList.remove("btn-primary");
			editBtn.classList.add("btn-secondary");
			editBtn.textContent = "編集";
			cancelBtn.style.display = "none";
			deleteBtn.disabled = false;
			statusSelect.disabled = true;
		};

		const setEditMode = () => {
			editBtn.classList.remove("btn-secondary");
			editBtn.classList.add("btn-primary");
			editBtn.textContent = "更新";
			cancelBtn.style.display = "";
			deleteBtn.disabled = true;
			statusSelect.disabled = false;
		};

		setViewMode();

		editBtn.addEventListener("click", async () => {
			if (editBtn.textContent === "編集") {
				setEditMode();
			} else {
				try {
					editBtn.disabled = true;
					await updateReport(this.api, id, { status: statusSelect.value });
					window.alert("更新しました。");
					await this.refresh();
					setViewMode();
				} catch (error) {
					console.error("更新に失敗しました:", error);
					window.alert("更新に失敗しました。時間をおいて再度お試しください。");
				} finally {
					editBtn.disabled = false;
				}
			}
		});

		cancelBtn.addEventListener("click", () => {
			statusSelect.value = reportDoc.status;
			setViewMode();
		});

		deleteBtn.addEventListener("click", async () => {
			const confirmed = window.confirm(`レポート (${id}) を削除します。よろしいですか？`);
			if (!confirmed) return;

			try {
				deleteBtn.disabled = true;
				await deleteReport(this.api, id);
				const modalElement = document.getElementById("detailModal")!;
				const bsModal = getOrCreateModal(modalElement);
				bsModal.hide();
				pushQueryState({ id: undefined });
				await this.refresh();
			} catch (error) {
				console.error("削除に失敗しました:", error);
				window.alert("削除に失敗しました。時間をおいて再度お試しください。");
				deleteBtn.disabled = false;
			}
		});
	}

	onCloseModal(): void {
		pushQueryState({ id: undefined });
	}
}
