import { DocumentData, DocumentSnapshot, Firestore, QuerySnapshot } from "firebase/firestore";
import { CRUDHandler } from "./types";
import { Client } from "../api/client";
import { listManageUsers } from "../resolvers/manage";
import { qsStrict } from "../utils";
import { ManageUser } from "../types";
import { createBasicActionColumn, resetBtn } from "../helpers";
import * as events from "../events";
import { convertManageUserToHtmlRow } from "../converters";

export class ManageUserCRUDHandler extends EventTarget implements CRUDHandler {
	firestore: Firestore;
	manageUsersTableList: HTMLTableElement;
	api: Client;

	constructor(firestore: Firestore, manageUsersTableList: HTMLTableElement, api: Client) {
		super();
		this.manageUsersTableList = manageUsersTableList;
		this.firestore = firestore;
		this.api = api;
	}

	async listManageUsers(limitCount: number, lastDoc?: DocumentSnapshot) {
		return listManageUsers(this.firestore, limitCount, lastDoc);
	}

	async refreshManageUser() {
		const LIMIT = 20;
		let readMoreBtn = qsStrict<HTMLButtonElement>("#readMoreManageUsersBtn");
		let lastDoc: DocumentSnapshot | undefined = undefined;
		const tbody = qsStrict<HTMLTableSectionElement>("tbody", this.manageUsersTableList);

		const loadManageUsers = async (reset = false) => {
			if (reset) {
				lastDoc = undefined;
				tbody.innerHTML = "";
			}

			readMoreBtn.disabled = true;
			let snapshot: QuerySnapshot<DocumentData> | undefined;
			try {
				snapshot = await this.listManageUsers(LIMIT + 1, lastDoc);
				const docs = snapshot.docs.slice(0, LIMIT);
				docs.forEach((doc) => {
					const data = doc.data() as Omit<ManageUser, "id">;
					const user: ManageUser = { ...data, id: doc.id };
					const tr = convertManageUserToHtmlRow(user);
					tr.appendChild(createBasicActionColumn());
					tbody.appendChild(tr);
				});

				lastDoc = docs.length > 0 ? docs[docs.length - 1] : undefined;
				const hasMore = snapshot.docs.length > LIMIT;
				readMoreBtn.disabled = !hasMore;
				readMoreBtn.style.display = hasMore ? "" : "none";
				this.dispatchEvent(new events.RefreshEvent());
			} catch (error) {
				console.error("管理ユーザー一覧の取得に失敗しました:", error);
				window.alert("管理ユーザー一覧の取得に失敗しました。時間をおいて再度お試しください。");
			} finally {
				if (snapshot == null) {
					readMoreBtn.disabled = false;
				}
			}
		};

		readMoreBtn = resetBtn(readMoreBtn);
		readMoreBtn.addEventListener("click", () => loadManageUsers());
		await loadManageUsers(true);
	}

	async onEdit(form: HTMLFormElement, id: string) {}

	async onSubmitEdit(form: HTMLFormElement) {}

	async onDelete(form: HTMLFormElement, id: string) {}

	async onSubmitDelete(form: HTMLFormElement) {}

	async onAppend(form: HTMLFormElement) {}

	async onSubmitAppend(form: HTMLFormElement) {}
}
