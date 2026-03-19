import { CRUDHandler } from "./types";
import { DocumentData, DocumentSnapshot, Firestore, QuerySnapshot } from "firebase/firestore";
import { getPrimaryFilterField, qsStrict } from "../utils";
import { ReportRecord } from "../types";
import { formToObject, resetBtn, setFormValuesByPropsWithTimeConvert } from "../helpers";
import { Client } from "../api/client";
import { getReport, listReport } from "../resolvers/report";
import { convertReportToHtmlRow } from "../converters";
import * as events from "../events";
import { deleteReport, updateReport } from "../api/manage";

export class ReportCRUDHandler extends EventTarget implements CRUDHandler {
	firestore: Firestore;
	reportsTableList: HTMLTableElement;
	api: Client;

	constructor(firestore: Firestore, reportsTableList: HTMLTableElement, api: Client) {
		super();
		this.reportsTableList = reportsTableList;
		this.firestore = firestore;
		this.api = api;
	}

	async listReport(
		limitCount: number,
		lastDoc?: DocumentSnapshot,
		filter?: {
			id?: string;
			reporterId?: string;
			contentId?: string;
			categories?: string[];
			description?: string;
			statuses?: string[];
		},
	) {
		return listReport(this.firestore, limitCount, lastDoc, filter);
	}

	async refreshReport() {
		const LIMIT = 20;
		let readMoreBtn = qsStrict<HTMLButtonElement>("#readMoreReportBtn");
		const filterBtn = qsStrict<HTMLButtonElement>("#filterReport");
		const idInput = qsStrict<HTMLInputElement>("#searchReportId input");
		const reporterIdInput = qsStrict<HTMLInputElement>("#searchReporterId input");
		const contentIdInput = qsStrict<HTMLInputElement>("#searchReportContentId input");
		const descriptionInput = qsStrict<HTMLInputElement>("#searchReportDescription input");
		let lastDoc: DocumentSnapshot | undefined = undefined;
		const tbody = qsStrict<HTMLTableSectionElement>("tbody", this.reportsTableList);
		const getSelectedCheckboxValues = (name: string): string[] => {
			return Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)).map(
				(cb) => cb.value,
			);
		};

		const loadReports = async (reset = false) => {
			if (reset) {
				lastDoc = undefined;
				tbody.innerHTML = "";
			}

			const filter = {
				id: idInput.value.trim() || undefined,
				reporterId: reporterIdInput.value.trim() || undefined,
				contentId: contentIdInput.value.trim() || undefined,
				categories: getSelectedCheckboxValues("filterCategory"),
				description: descriptionInput.value.trim() || undefined,
				statuses: getSelectedCheckboxValues("filterStatus"),
			};

			readMoreBtn.disabled = true;
			let snapshot: QuerySnapshot<DocumentData> | undefined;
			try {
				snapshot = await this.listReport(LIMIT + 1, lastDoc, filter);

				let docs = snapshot.docs.slice(0, LIMIT);
				const primaryField = getPrimaryFilterField(filter);
				if (primaryField !== "categories" && filter.categories && filter.categories.length > 0) {
					docs = docs.filter((doc) => {
						const data = doc.data() as ReportRecord;
						return filter.categories!.includes(data.category);
					});
				}
				if (primaryField !== "statuses" && filter.statuses && filter.statuses.length > 0) {
					docs = docs.filter((doc) => {
						const data = doc.data() as ReportRecord;
						return filter.statuses!.includes(data.status);
					});
				}

				docs.forEach((doc) => {
					const data = doc.data() as ReportRecord;
					const dataWithId = { ...data, id: doc.id } as ReportRecord;
					const tr = convertReportToHtmlRow(dataWithId);
					tr.style.cursor = "pointer";
					tbody.appendChild(tr);
				});

				lastDoc = snapshot.docs[LIMIT - 1];
				const hasMore = snapshot.docs.length > LIMIT;
				readMoreBtn.disabled = !hasMore;
				readMoreBtn.style.display = hasMore ? "" : "none";
				this.dispatchEvent(new events.RefreshEvent());
			} catch (error) {
				console.error("レポート一覧の取得に失敗しました:", error);
				window.alert("レポート一覧の取得に失敗しました。時間をおいて再度お試しください。");
			} finally {
				if (snapshot == null) {
					readMoreBtn.disabled = false;
				}
			}
		};

		const freshFilterBtn = resetBtn(filterBtn);
		readMoreBtn = resetBtn(readMoreBtn);

		freshFilterBtn.addEventListener("click", () => loadReports(true));
		readMoreBtn.addEventListener("click", () => loadReports());
		await loadReports();
	}

	async onEdit(form: HTMLFormElement, id: string) {
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
	}

	async onSubmitEdit(form: HTMLFormElement) {
		const { id, status } = formToObject<ReportRecord>(form);
		try {
			await updateReport(this.api, id, { status });
			const tbody = qsStrict<HTMLTableSectionElement>("tbody", this.reportsTableList);
			tbody.innerHTML = "";
			await this.refreshReport();
		} catch (error) {
			console.error("更新に失敗しました:", error);
			window.alert("更新に失敗しました。時間をおいて再度お試しください。");
		}
	}

	async onDelete(form: HTMLFormElement, id: string) {
		setFormValuesByPropsWithTimeConvert(form, { id }, ["id"]);
	}

	async onSubmitDelete(form: HTMLFormElement) {
		const { id } = formToObject<ReportRecord>(form);
		try {
			await deleteReport(this.api, id);
			const tbody = qsStrict<HTMLTableSectionElement>("tbody", this.reportsTableList);
			tbody.innerHTML = "";
			await this.refreshReport();
		} catch (error) {
			console.error("削除に失敗しました:", error);
			window.alert("削除に失敗しました。時間をおいて再度お試しください。");
		}
	}

	async onAppend(form: HTMLFormElement) {}

	async onSubmitAppend(form: HTMLFormElement) {}
}
