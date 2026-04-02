import { Firestore } from "firebase/firestore";
import { DetailHandler } from "./types";
import { Client } from "../api/client";
import { getOrCreateModal, pushQueryState, resetBtn, setFormValuesByPropsWithTimeConvert } from "../helpers";
import * as manage from "../resolvers/manage";
import { qsStrict } from "../utils";
import { ManageUser } from "../types";
import { deleteManageUser, updateManageUser } from "../api/manage";

export class ManageUserDetailHandler extends EventTarget implements DetailHandler {
	firestore: Firestore;
	api: Client;
	refresh: () => Promise<void>;

	constructor(firestore: Firestore, api: Client, refresh: () => Promise<void>) {
		super();
		this.firestore = firestore;
		this.api = api;
		this.refresh = refresh;
	}

	async onDetail(form: HTMLFormElement, id: string): Promise<void | false> {
		const userDoc = await manage.resolvers(this.firestore, id);
		if (userDoc == null) {
			window.alert("管理ユーザーが見つかりませんでした。");
			return false;
		}
		pushQueryState({ id });

		let isEditMode = false;
		const user: ManageUser = { ...userDoc, id: userDoc.id };
		let currentUser = user;
		const setFormValues = (user: ManageUser) => {
			setFormValuesByPropsWithTimeConvert(form, user, ["id", "name", "role", "createdAt", "updatedAt"]);
		};
		setFormValues(currentUser);

		let editBtn = resetBtn(qsStrict<HTMLButtonElement>("#editBtn"));
		let deleteBtn = resetBtn(qsStrict<HTMLButtonElement>("#deleteBtn"));
		const nameInput = qsStrict<HTMLInputElement>("[name=name]", form);
		const roleSelect = qsStrict<HTMLSelectElement>("[name=role]", form);

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
			isEditMode = false;
			deleteBtn.disabled = false;
			nameInput.readOnly = true;
			roleSelect.disabled = true;
		};

		const setEditMode = () => {
			editBtn.classList.remove("btn-secondary");
			editBtn.classList.add("btn-primary");
			editBtn.textContent = "更新";
			cancelBtn.style.display = "";
			isEditMode = true;
			deleteBtn.disabled = true;
			nameInput.readOnly = false;
			roleSelect.disabled = false;
		};

		setViewMode();

		editBtn.addEventListener("click", async () => {
			if (editBtn.textContent === "編集") {
				setEditMode();
				return;
			}

			const name = nameInput.value.trim();
			if (!name) {
				window.alert("名前を入力してください。");
				nameInput.focus();
				return;
			}
			const role = roleSelect.value;

			try {
				await updateManageUser(this.api, currentUser.id, {
					name,
					role: role || undefined,
				});
				const user = await manage.resolvers(this.firestore, id);
				if (user == null) {
					window.alert("ユーザーが見つかりませんでした。");
					return;
				}
				currentUser = { ...user, id: user.id };
				setFormValues(currentUser);
				await this.refresh();
				setViewMode();
			} catch (error) {
				console.error("ユーザーの更新に失敗しました:", error);
				window.alert("ユーザーの更新に失敗しました。");
				return;
			}
		});

		deleteBtn.addEventListener("click", async () => {
			const confirmed1 = window.confirm(`${currentUser.name} (${id}) を削除します。よろしいですか？`);
			if (!confirmed1) return;

			const confirmed2 = window.confirm("削除操作は元に戻せません。本当に実行してよろしいですか？");
			if (!confirmed2) return;
			try {
				deleteBtn.disabled = true;
				await deleteManageUser(this.api, currentUser.id);
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

		cancelBtn.addEventListener("click", () => {
			setFormValues(currentUser);
			setViewMode();
		});
	}

	onCloseModal(): void {
		pushQueryState({ id: undefined });
	}
}
