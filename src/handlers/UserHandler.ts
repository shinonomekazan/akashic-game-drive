import { DocumentSnapshot, Firestore } from "firebase/firestore";
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
			const snapshot = await this.listUser(LIMIT, lastDoc, filter);

			snapshot.docs.forEach((doc) => {
				const data = doc.data() as UserProfile;
				const row = document.createElement("tr");
				row.style.cursor = "pointer";
				row.innerHTML = `
                    <td>${doc.id}</td>
                    <td>${data.name ?? ""}</td>
                `;
				row.appendChild(createBasicActionColumn());
				tbody.appendChild(row);
			});

			lastDoc = snapshot.docs[snapshot.docs.length - 1];
			const hasMore = snapshot.docs.length === LIMIT;
			readMoreBtn.disabled = !hasMore;
			readMoreBtn.style.display = hasMore ? "" : "none";
		};

		filterBtn.addEventListener("click", () => loadUsers(true));
		readMoreBtn.addEventListener("click", () => loadUsers());
		await loadUsers();
	}

	async onDetail(form: HTMLFormElement, id: string): Promise<void> {
		console.log("ユーザID:", id);
	}
}
