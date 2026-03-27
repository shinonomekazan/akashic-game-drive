import { DocumentData, DocumentSnapshot, Firestore, QuerySnapshot } from "firebase/firestore";
import { CRUDHandler } from "./types";
import { Client } from "../api/client";
import { ContentListFilter, ContentSearchCondition, listContents } from "../resolvers/contents";
import { qsStrict } from "../utils";
import { ContentRecord } from "../types";
import { createBasicActionColumn, resetBtn } from "../helpers";
import * as events from "../events";
import { convertManageContentToHtmlRow } from "../converters";

export class ContentCRUDHandler extends EventTarget implements CRUDHandler {
	firestore: Firestore;
	contentsTableList: HTMLTableElement;
	api: Client;

	constructor(firestore: Firestore, contentsTableList: HTMLTableElement, api: Client) {
		super();
		this.contentsTableList = contentsTableList;
		this.firestore = firestore;
		this.api = api;
	}

	async listContents(limitCount: number, lastDoc?: DocumentSnapshot, filter?: ContentListFilter) {
		return listContents(this.firestore, limitCount, lastDoc, filter);
	}

	async refreshContent() {
		const LIMIT = 20;
		let readMoreBtn = qsStrict<HTMLButtonElement>("#readMoreBtn");
		const filterBtn = qsStrict<HTMLButtonElement>("#filterContent");
		const fieldSelect = qsStrict<HTMLSelectElement>("#searchFieldSelect");
		const fieldInput = qsStrict<HTMLInputElement>("#searchFieldInput");
		const statusSelect = qsStrict<HTMLSelectElement>("#searchStatus select");
		let lastDoc: DocumentSnapshot | undefined = undefined;
		const tbody = qsStrict<HTMLTableSectionElement>("tbody", this.contentsTableList);
		const getSelectedCheckboxValues = (name: string): string[] => {
			return Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)).map(
				(cb) => cb.value,
			);
		};

		const loadContent = async (reset = false) => {
			if (reset) {
				lastDoc = undefined;
				tbody.innerHTML = "";
			}

			const fieldValue = fieldInput.value.trim() || undefined;
			const filter: ContentListFilter = {
				id: fieldSelect.value === "id" ? fieldValue : undefined,
				userId: fieldSelect.value === "userId" ? fieldValue : undefined,
				userName: fieldSelect.value === "userName" ? fieldValue : undefined,
				title: fieldSelect.value === "title" ? fieldValue : undefined,
				description: fieldSelect.value === "description" ? fieldValue : undefined,
				status: statusSelect.value.trim() || undefined,
				conditions: getSelectedCheckboxValues("filterConditions") as ContentSearchCondition[],
			};

			readMoreBtn.disabled = true;
			let snapshot: QuerySnapshot<DocumentData> | undefined;
			try {
				snapshot = await this.listContents(LIMIT + 1, lastDoc, filter);
				const docs = snapshot.docs.slice(0, LIMIT);
				docs.forEach((doc) => {
					const data = doc.data() as ContentRecord;
					const dataWithId = { ...data, id: doc.id } as ContentRecord;
					const tr = convertManageContentToHtmlRow(dataWithId);
					tr.appendChild(createBasicActionColumn());
					tbody.appendChild(tr);
				});

				lastDoc = snapshot.docs[LIMIT - 1];
				const hasMore = snapshot.docs.length > LIMIT;
				readMoreBtn.disabled = !hasMore;
				readMoreBtn.style.display = hasMore ? "" : "none";
				this.dispatchEvent(new events.RefreshEvent());
			} catch (error) {
				console.error("コンテンツ一覧の取得に失敗しました:", error);
				window.alert("コンテンツ一覧の取得に失敗しました。時間をおいて再度お試しください。");
			} finally {
				if (snapshot == null) {
					readMoreBtn.disabled = false;
				}
			}
		};

		const freshFilterBtn = resetBtn(filterBtn);
		readMoreBtn = resetBtn(readMoreBtn);

		freshFilterBtn.addEventListener("click", () => loadContent(true));
		readMoreBtn.addEventListener("click", () => loadContent());
		await loadContent(true);
	}

	async onEdit(form: HTMLFormElement, id: string) {}

	async onSubmitEdit(form: HTMLFormElement) {}

	async onDelete(form: HTMLFormElement, id: string) {}

	async onSubmitDelete(form: HTMLFormElement) {}

	async onAppend(form: HTMLFormElement) {}

	async onSubmitAppend(form: HTMLFormElement) {}
}
