import "bootstrap";
import "./css/bootstrap.min.css";
import type { User } from "firebase/auth";
import { connectAuthEmulator } from "firebase/auth";
import { signInWithGoogle, signOutCurrentUser, watchAuthChanges } from "./auth";
import { initializeFirebase, type FirebaseInstance } from "./firebase";
import { appConfig } from "./config";
import type { AppConfig } from "./config.types";
import { isDebugMode, navigateTo, qsStrict } from "./utils";

type Route = { name: "top" } | { name: "login" } | { name: "my" };

interface AppState {
	route: Route;
	user: User | null;
	loading: boolean;
}

export class App {
	firebase: FirebaseInstance;
	config: AppConfig;
	rootEl: HTMLElement;
	toastEl: HTMLElement;
	state: AppState;

	constructor(config: AppConfig = appConfig as AppConfig) {
		this.config = config;
		this.firebase = initializeFirebase(this.config.firebaseConfig);
		this.rootEl = qsStrict<HTMLElement>("#app-root");
		this.toastEl = qsStrict<HTMLElement>("#toast");
		this.state = {
			route: this.parseRoute(),
			user: null,
			loading: true,
		};
		this.connectEmulatorIfDebug();
	}

	async main() {
		watchAuthChanges(this.firebase, async (user) => {
			this.state = {
				...this.state,
				user,
				loading: false,
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
	}

	parseRoute(): Route {
		const path = window.location.pathname || "/";
		if (path === "/") {
			return { name: "top" };
		}
		if (path.startsWith("/login")) {
			return { name: "login" };
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
			case "my":
				this.renderMy();
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

	renderMy() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			navigateTo("/login");
			return;
		}

		const displayName = this.escapeHtml(this.state.user?.displayName ?? "ユーザー");
		this.setContent(
			`
		<div class="position-absolute top-0 end-0 p-3">
			<button id="logout" class="btn btn-outline-secondary">ログアウト</button>
		</div>
		<div class="d-flex align-items-center justify-content-center min-vh-100">
			<div class="text-center">
				<div class="display-6 fw-semibold text-dark">${displayName}</div>
			</div>
		</div>
      `,
			true,
		);

		const logoutBtn = qsStrict<HTMLButtonElement>("#logout");
		logoutBtn.addEventListener("click", async () => {
			await signOutCurrentUser(this.firebase);
			navigateTo("/login");
		});
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
