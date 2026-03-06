import { DocumentData, DocumentSnapshot, Firestore, QuerySnapshot } from "firebase/firestore";
import { DetailHandler } from "./types";
import { listUser } from "../resolvers";
import { qsStrict } from "../utils";
import { UserProfile } from "../types";
import { createBasicActionColumn } from "../helper";

export class UserHandler implements DetailHandler {
	firestore: Firestore;
	usersTableList: HTMLTableElement;

	constructor(firestore: Firestore, usersTableList: HTMLTableElement) {
		this.usersTableList = usersTableList;
		this.firestore = firestore;
	}

	async listUser(limitCount: number, lastDoc?: DocumentSnapshot, filter?: { id?: string; username?: string }) {
		return listUser(this.firestore, limitCount, lastDoc, filter);
	}

	async refreshUser() {
		const LIMIT = 20;
		const readMoreBtn = qsStrict<HTMLButtonElement>("#readMoreBtn");
		const filterBtn = qsStrict<HTMLButtonElement>("#filterUser");
		const idInput = qsStrict<HTMLInputElement>("#searchUserId input");
		const usernameInput = qsStrict<HTMLInputElement>("#searchUserName input");
		let lastDoc: DocumentSnapshot | undefined = undefined;
		const tbody = qsStrict<HTMLTableSectionElement>("tbody", this.usersTableList);

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
		};

		filterBtn.addEventListener("click", () => loadUsers(true));
		readMoreBtn.addEventListener("click", () => loadUsers());
		await loadUsers();
	}

	async onDetail(form: HTMLFormElement, id: string): Promise<void> {
		console.log("ユーザID:", id);
	}
}
