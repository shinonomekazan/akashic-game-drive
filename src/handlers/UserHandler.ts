import { DocumentData, DocumentSnapshot, Firestore, QuerySnapshot } from "firebase/firestore";
import { DetailHandler } from "./types";
import { getUser, listContent, listFeedbacks, listMyFeedbacks, listUser } from "../resolvers";
import { qsStrict } from "../utils";
import { ContentRecord, FeedbackRecord, UserProfile } from "../types";
import {
	createBasicActionColumn,
	formToObject,
	getOrCreateModal,
	pushQueryState,
	resetBtn,
	setFormValuesByPropsWithTimeConvert,
} from "../helpers";
import { convertContentToHtmlRow, convertFeedbackToHtmlRow, convertMyFeedbackToHtmlRow } from "../converters";
import { deleteUser, updateUser } from "../api/manage";
import { Client } from "../api/client";
import * as events from "../events";

export class UserHandler extends EventTarget implements DetailHandler {
	firestore: Firestore;
	usersTableList: HTMLTableElement;
	api: Client;

	constructor(firestore: Firestore, usersTableList: HTMLTableElement, api: Client) {
		super();
		this.usersTableList = usersTableList;
		this.firestore = firestore;
		this.api = api;
	}

	async listUser(limitCount: number, lastDoc?: DocumentSnapshot, filter?: { id?: string; username?: string }) {
		return listUser(this.firestore, limitCount, lastDoc, filter);
	}

	async refreshUser() {
		const LIMIT = 20;
		let readMoreBtn = qsStrict<HTMLButtonElement>("#readMoreBtn");
		const filterBtn = qsStrict<HTMLButtonElement>("#filterUser");
		const idInput = qsStrict<HTMLInputElement>("#searchUserId input");
		const usernameInput = qsStrict<HTMLInputElement>("#searchUserName input");
		let lastDoc: DocumentSnapshot | undefined = undefined;
		const tbody = qsStrict<HTMLTableSectionElement>("tbody", this.usersTableList);
		tbody.innerHTML = "";
		const loadUsers = async (reset = false) => {
			if (reset) {
				lastDoc = undefined;
				tbody.innerHTML = "";
			}

			const filter = {
				id: idInput.value.trim() || undefined,
				username: usernameInput.value.trim() || undefined,
			};

			readMoreBtn.disabled = true;
			let snapshot: QuerySnapshot<DocumentData> | undefined;
			try {
				snapshot = await this.listUser(LIMIT, lastDoc, filter);
				snapshot.docs.forEach((doc) => {
					const data = doc.data() as UserProfile;
					const row = document.createElement("tr");
					row.style.cursor = "pointer";
					const idCell = document.createElement("td");
					idCell.textContent = doc.id;
					row.appendChild(idCell);
					const nameCell = document.createElement("td");
					nameCell.textContent = data.name ?? "";
					row.dataset.id = doc.id;
					row.appendChild(nameCell);
					row.appendChild(createBasicActionColumn());
					tbody.appendChild(row);
				});
				lastDoc = snapshot.docs[snapshot.docs.length - 1];
				const hasMore = snapshot.docs.length === LIMIT;
				readMoreBtn.disabled = !hasMore;
				readMoreBtn.style.display = hasMore ? "" : "none";
			} catch (error) {
				console.error("ユーザ一覧の取得に失敗しました:", error);
				window.alert("ユーザ一覧の取得に失敗しました。時間をおいて再度お試しください。");
			} finally {
				if (snapshot == null) {
					readMoreBtn.disabled = false;
				}
			}
			this.dispatchEvent(new events.RefreshEvent());
		};

		const freshFilterBtn = resetBtn(filterBtn);
		readMoreBtn = resetBtn(readMoreBtn);

		freshFilterBtn.addEventListener("click", () => loadUsers(true));
		readMoreBtn.addEventListener("click", () => loadUsers());
		await loadUsers(true);
	}

	async onDetail(form: HTMLFormElement, id: string): Promise<void> {
		pushQueryState({ id });
		const userDoc = await getUser(this.firestore, id);
		const name = (userDoc as UserProfile)?.name ?? "";
		setFormValuesByPropsWithTimeConvert(form, userDoc!, ["uid", "name", "createdAt", "updatedAt"]);

		const contentsTableList = qsStrict<HTMLDivElement>("#contentsTableList");
		const tbody = qsStrict<HTMLTableSectionElement>("tbody", contentsTableList);
		tbody.innerHTML = "";
		const contentDoc = await listContent(this.firestore, id);
		contentDoc.docs.forEach((doc) => {
			const contentData = { id: doc.id, ...doc.data() } as ContentRecord;
			const tr = convertContentToHtmlRow(contentData);
			tbody.appendChild(tr);
		});

		const myFeedbacksTableList = qsStrict<HTMLTableElement>("#myFeedbacksTableList");
		const myFeedbacksTbody = qsStrict<HTMLTableSectionElement>("tbody", myFeedbacksTableList);
		myFeedbacksTbody.innerHTML = "";
		const myFeedbacksDoc = await listMyFeedbacks(this.firestore, id);
		myFeedbacksDoc.docs.forEach((doc) => {
			const feedbackData = { id: doc.id, ...doc.data() } as FeedbackRecord;
			const tr = convertMyFeedbackToHtmlRow(feedbackData);
			myFeedbacksTbody.appendChild(tr);
		});

		const feedbacksTableList = qsStrict<HTMLTableElement>("#feedbacksTableList");
		const feedbacksTbody = qsStrict<HTMLTableSectionElement>("tbody", feedbacksTableList);
		feedbacksTbody.innerHTML = "";
		const feedbacksDoc = await listFeedbacks(this.firestore, id);
		feedbacksDoc.docs.forEach((doc) => {
			const feedbackData = { id: doc.id, ...doc.data() } as FeedbackRecord;
			const tr = convertFeedbackToHtmlRow(feedbackData);
			feedbacksTbody.appendChild(tr);
		});

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

		const nameInput = qsStrict<HTMLInputElement>("input[name=name]", form);

		const setViewMode = () => {
			editBtn.classList.remove("btn-primary");
			editBtn.classList.add("btn-secondary");
			editBtn.textContent = "編集";
			cancelBtn.style.display = "none";
			deleteBtn.disabled = false;
			nameInput.readOnly = true;
		};

		const setEditMode = () => {
			editBtn.classList.remove("btn-secondary");
			editBtn.classList.add("btn-primary");
			editBtn.textContent = "確定";
			cancelBtn.style.display = "";
			deleteBtn.disabled = true;
			nameInput.readOnly = false;
		};

		setViewMode();

		editBtn.addEventListener("click", async () => {
			if (editBtn.textContent === "編集") {
				setEditMode();
			} else {
				try {
					await updateUser(this.api, id, formToObject(form));
				} catch (error) {
					throw error;
				}
				location.reload();
			}
		});

		cancelBtn.addEventListener("click", () => {
			setFormValuesByPropsWithTimeConvert(form, userDoc!, ["uid", "name", "createdAt", "updatedAt"]);
			setViewMode();
		});

		deleteBtn.addEventListener("click", async () => {
			const confirmed1 = window.confirm(`${name} (${id}) を削除します。よろしいですか？`);
			if (!confirmed1) return;

			const confirmed2 = window.confirm("削除操作は元に戻せません。本当に実行してよろしいですか？");
			if (!confirmed2) return;

			try {
				deleteBtn.disabled = true;
				await deleteUser(this.api, id);
				const modalElement = document.getElementById("detailModal")!;
				const bsModal = getOrCreateModal(modalElement);
				bsModal.hide();
				pushQueryState({ id: undefined });
				await this.refreshUser();
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
