import { watchAuthChanges, User as FirebaseUser } from "./auth";
import { App } from "./App";
import * as utils from "./utils";
import { manage } from "./resolvers";
import { UserHandler } from "./handlers";
import * as api from "./api";

type ManageMenuItem = {
	label: string;
	href: string;
};

const MANAGE_MENU_ITEMS: ManageMenuItem[] = [
	{ label: "ユーザー管理", href: "/manage/users/" },
	{ label: "コンテンツ管理", href: "/manage/contents/" },
	{ label: "管理ユーザー管理", href: "/manage/authority/" },
];

export class Manage extends App {
	constructor() {
		super();
	}

	async topPage() {
		watchAuthChanges(this.firebase, async (user) => {
			if (user == null) {
				const loginUrl = new URL("/login", window.location.origin);
				loginUrl.searchParams.set("next", window.location.pathname || "/manage/index.html");
				if (utils.isDebugMode()) {
					loginUrl.searchParams.set("debug", "true");
				}
				window.location.href = loginUrl.toString();
				return;
			}

			const hasPermission = await this.canUseManageTool(user);
			this.renderManagePage(hasPermission);
		});
	}

	async usersPage() {
		const usersContent = utils.qsStrict<HTMLDivElement>("#usersContent");
		watchAuthChanges(this.firebase, async (user) => {
			if (user == null) {
				const loginUrl = new URL("/login", window.location.origin);
				loginUrl.searchParams.set("next", window.location.pathname || "/manage/users/index.html");
				if (utils.isDebugMode()) {
					loginUrl.searchParams.set("debug", "true");
				}
				window.location.href = loginUrl.toString();
				return;
			}

			const hasPermission = await this.canUseManageTool(user);
			if (!hasPermission) {
				this.setContent(
					`
						<div class="manage-page d-flex flex-column justify-content-center align-items-center text-center px-3">
							<div class="manage-top mb-4">
								<h1 class="manage-title">
									<span class="manage-title-main">ニコ生ゲーム置き場（仮）</span>
									<span class="manage-title-sub">管理ツール – ユーザー管</span>
								</h1>
								<p class="manage-error-message">このツールを利用する権限がありません</p>
							</div>
						</div>
					`,
					true,
				);
				return;
			}
			usersContent.classList.remove("d-none");
		});

		const usersTableList = utils.qsStrict<HTMLTableElement>("#usersTableList");
		const userHandler = new UserHandler(this.firebase.firestore, usersTableList);
		await userHandler.refreshUser();
	}

	async canUseManageTool(user: FirebaseUser): Promise<boolean> {
		const manageUser = await manage.resolvers(this.firebase.firestore, user.uid);
		if (manageUser?.role === "administrator") {
			await this.ensureManageClaims(user);
			return true;
		}
		return false;
	}

	async ensureManageClaims(user: FirebaseUser) {
		const tokenResult = await user.getIdTokenResult();
		if (tokenResult.claims.role === "admin") return;
		await api.manage.authenticate(this.apiClient);
		await user.getIdToken(true);
	}

	renderManagePage(hasPermission: boolean) {
		const errorMessage = hasPermission
			? ""
			: '<p class="manage-error-message">このツールを利用する権限がありません</p>';
		const buttonHtml = MANAGE_MENU_ITEMS.map((item) => {
			const disabledAttrs = hasPermission ? "" : 'aria-disabled="true" tabindex="-1"';
			const disabledClass = hasPermission ? "btn btn-outline-primary" : "btn btn-outline-secondary disabled";
			const href = hasPermission ? utils.escapeHtml(item.href) : "#";
			return `
					<a class="${disabledClass}" href="${href}" ${disabledAttrs}>
						${utils.escapeHtml(item.label)}
					</a>
			`;
		}).join("");

		this.setContent(
			`
				<div class="manage-page d-flex flex-column justify-content-center align-items-center text-center px-3">
					<div class="manage-top mb-4">
						<h1 class="manage-title">
							<span class="manage-title-main">ニコ生ゲーム置き場（仮）</span>
							<span class="manage-title-sub">管理ツール</span>
						</h1>
						${errorMessage}
					</div>
					<div class="manage-buttons d-grid gap-3">
						${buttonHtml}
					</div>
				</div>
			`,
			true,
		);
	}
}
