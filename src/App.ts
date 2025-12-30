import "bootstrap";
import "./css/bootstrap.min.css";
import type { User } from "firebase/auth";
import { connectAuthEmulator } from "firebase/auth";
import { signInWithGoogle, signOutCurrentUser, watchAuthChanges } from "./auth";
import { initializeFirebase, type FirebaseInstance } from "./firebase";
import { appConfig } from "./config";
import type { AppConfig } from "./config.types";
import type { UserProfile } from "./types";
import { isDebugMode, navigateTo, qsStrict } from "./utils";
import { getUser } from "./resolvers";
import { connectFirestoreEmulator } from "firebase/firestore";
import { Client } from "./api/client";
import { createUser } from "./api/users";

type Route = { name: "top" } | { name: "login" } | { name: "my" } | { name: "my-edit" };

interface AppState {
	route: Route;
	user: User | null;
	loading: boolean;
	profile: UserProfile | null;
	profileLoaded: boolean;
	profileLoading: boolean;
	needsProfile: boolean;
}

export class App {
	firebase: FirebaseInstance;
	config: AppConfig;
	apiClient: Client;
	rootEl: HTMLElement;
	toastEl: HTMLElement;
	state: AppState;

	constructor(config: AppConfig = appConfig as AppConfig) {
		this.config = config;
		this.firebase = initializeFirebase(this.config.firebaseConfig);
		this.apiClient = new Client({
			apiConfig: this.config.apiConfig,
			useEmulator: isDebugMode(),
		});
		this.rootEl = qsStrict<HTMLElement>("#app-root");
		this.toastEl = qsStrict<HTMLElement>("#toast");
		this.state = {
			route: this.parseRoute(),
			user: null,
			loading: true,
			profile: null,
			profileLoaded: false,
			profileLoading: false,
			needsProfile: false,
		};
		this.connectEmulatorIfDebug();
	}

	async main() {
		watchAuthChanges(this.firebase, async (user) => {
			this.apiClient.idTokenFunction = user ? () => user.getIdToken() : undefined;
			this.state = {
				...this.state,
				user,
				loading: false,
				profile: null,
				profileLoaded: false,
				profileLoading: false,
				needsProfile: false,
			};
			await this.render();
		});

		window.addEventListener("popstate", async () => {
			this.state = { ...this.state, route: this.parseRoute() };
			await this.render();
		});

		await this.render();
	}

	connectEmulatorIfDebug() {
		if (!isDebugMode()) return;
		connectAuthEmulator(this.firebase.auth, "http://localhost:9099");
		connectFirestoreEmulator(this.firebase.firestore, "localhost", 8080);
	}

	parseRoute(): Route {
		const path = window.location.pathname || "/";
		if (path === "/") {
			return { name: "top" };
		}
		if (path.startsWith("/login")) {
			return { name: "login" };
		}
		if (path.startsWith("/my/edit")) {
			return { name: "my-edit" };
		}
		if (path.startsWith("/my")) {
			return { name: "my" };
		}
		return { name: "top" };
	}

	async render() {
		if (this.state.loading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		switch (this.state.route.name) {
			case "login":
				this.renderLogin();
				break;
			case "my-edit":
				await this.renderMyEdit();
				break;
			case "my":
				await this.renderMy();
				break;
			case "top":
			default:
				this.redirectFromRoot();
				break;
		}
	}

	redirectFromRoot() {
		if (this.state.user) {
			navigateTo("/my");
			return;
		}
		navigateTo("/login");
	}

	async renderMy() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			navigateTo("/login");
			return;
		}

		if (this.state.profileLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.profileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserProfile();
			await this.render();
			return;
		}

		if (this.state.needsProfile) {
			this.renderProfileSetup();
			return;
		}

		this.renderMyProfile();
	}

	async renderMyEdit() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			navigateTo("/login");
			return;
		}

		if (this.state.profileLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.profileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserProfile();
			await this.render();
			return;
		}

		this.renderProfileSetup();
	}

	async loadUserProfile() {
		const currentUser = this.state.user;
		if (!currentUser || this.state.profileLoading) {
			return;
		}
		this.state = { ...this.state, profileLoading: true };
		try {
			let profile = await getUser(this.firebase.firestore, currentUser.uid);
			if (!profile) {
				this.state = {
					...this.state,
					profile: null,
					profileLoaded: true,
					profileLoading: false,
					needsProfile: true,
				};
				return;
			}
			this.state = {
				...this.state,
				profile,
				profileLoaded: true,
				profileLoading: false,
				needsProfile: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				profileLoaded: true,
				profileLoading: false,
				needsProfile: false,
			};
			this.showToast((err as Error).message || "ユーザー情報の取得に失敗しました", "error");
		}
	}

	renderMyProfile() {
		this.renderMyContent(this.state.profile);
	}

	renderProfileSetup() {
		const isEditRoute = this.state.route.name === "my-edit";
		const existingName = isEditRoute ? (this.state.profile?.name ?? "") : "";
		this.setContent(`
			<div class="row justify-content-center">
				<div class="col-md-6 col-lg-5">
					<div class="card shadow-sm">
						<div class="card-body">
							<h1 class="h5 mb-3">プロフィール登録</h1>
							<form id="profile-setup-form">
								<div class="mb-3">
									<label class="form-label" for="profile-name">名前</label>
									<input id="profile-name" class="form-control" type="text" placeholder="名前を入力" autocomplete="name" required />
								</div>
								<div class="d-grid">
									<button id="profile-save" class="btn btn-primary" type="submit">確定</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			</div>
		`);

		const form = qsStrict<HTMLFormElement>("#profile-setup-form");
		const nameInput = qsStrict<HTMLInputElement>("#profile-name");
		const saveBtn = qsStrict<HTMLButtonElement>("#profile-save");
		nameInput.value = existingName;
		nameInput.focus();

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const name = nameInput.value.trim();
			if (!name) {
				this.showToast("名前を入力してください", "error");
				nameInput.focus();
				return;
			}

			saveBtn.disabled = true;
			saveBtn.textContent = "保存中...";
			try {
				await createUser(this.apiClient, name);
				this.showToast("プロフィールを登録しました");
				this.state = {
					...this.state,
					profile: null,
					profileLoaded: false,
					profileLoading: false,
					needsProfile: false,
				};
				if (isEditRoute) {
					navigateTo("/my");
					return;
				}
				await this.render();
			} catch (err) {
				this.showToast((err as Error).message || "ユーザー情報の登録に失敗しました", "error");
			} finally {
				saveBtn.disabled = false;
				saveBtn.textContent = "確定";
			}
		});
	}

	renderMyContent(profile: UserProfile | null) {
		const name = profile?.name ?? "-";
		const createdAt = this.formatTimestamp(profile?.createdAt);
		const profileNotice = profile
			? ""
			: `
			<div class="alert alert-warning d-flex align-items-center" role="alert">
				<span>ユーザー情報が未登録です。バックエンドで作成してください。</span>
			</div>
		`;

		this.setContent(`
			${profileNotice}
			<div class="agd-my-header">
				<div>
					<div class="agd-user-name">${this.escapeHtml(name)} マイページ</div>
					<div class="agd-meta">作成日: ${createdAt}</div>
				</div>
				<div class="agd-actions">
					<button id="edit-profile" class="btn btn-outline-primary">編集</button>
					<button id="logout" class="btn btn-outline-secondary">ログアウト</button>
				</div>
			</div>
			<div class="card shadow-sm">
				<div class="card-body">
					<div class="d-flex align-items-center justify-content-between mb-3">
						<h2 class="h6 mb-0">コンテンツ一覧</h2>
					</div>
					<div class="agd-empty">コンテンツはまだありません。</div>
				</div>
			</div>
		`);

		this.bindMyActions();
	}

	bindMyActions() {
		const logoutBtn = qsStrict<HTMLButtonElement>("#logout");
		logoutBtn.addEventListener("click", async () => {
			await signOutCurrentUser(this.firebase);
			navigateTo("/login");
		});

		const editBtn = qsStrict<HTMLButtonElement>("#edit-profile");
		editBtn.addEventListener("click", () => {
			navigateTo("/my/edit");
		});
	}

	formatTimestamp(value: UserProfile["createdAt"]) {
		if (!value) return "-";
		return value.toDate().toLocaleString("vi-VN");
	}

	renderLogin() {
		const signedIn = this.state.user !== null;
		this.setContent(`
		<div class="row justify-content-center">
			<div class="col-md-6 col-lg-5">
				<div class="card shadow-sm">
					<div class="card-body">
						<h1 class="h4 mb-3">ログイン</h1>
						<p class="text-secondary">下のボタンからGoogleでログインしてください。</p>
						<div class="d-grid gap-2">
							<button id="login-google" class="btn btn-primary">
							${signedIn ? "再ログイン" : "Googleでログイン"}
							</button>
							${signedIn ? '<button id="logout" class="btn btn-outline-secondary">ログアウト</button>' : ""}
						</div>
					</div>
				</div>
			</div>
		</div>
    `);

		const loginBtn = qsStrict<HTMLButtonElement>("#login-google");
		loginBtn.addEventListener("click", async () => {
			try {
				await signInWithGoogle(this.firebase);
				this.showToast("ログインしました");
				navigateTo("/my");
			} catch (err) {
				this.showToast((err as Error).message, "error");
			}
		});

		if (signedIn) {
			const logoutBtn = qsStrict<HTMLButtonElement>("#logout");
			logoutBtn.addEventListener("click", async () => {
				await signOutCurrentUser(this.firebase);
				navigateTo("/login");
			});
		}
	}

	setContent(html: string, fullScreen = false) {
		this.rootEl.innerHTML = fullScreen ? html : `<div class="container agd-page">${html}</div>`;
	}

	showToast(message: string, type: "success" | "error" = "success") {
		this.toastEl.textContent = message;
		this.toastEl.className = `agd-toast ${type}`;
		this.toastEl.style.opacity = "1";
		setTimeout(() => {
			this.toastEl.style.opacity = "0";
		}, 3200);
	}

	escapeHtml(value: string) {
		const map: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#039;",
		};
		return value.replace(/[&<>"']/g, (m) => map[m]);
	}
}
