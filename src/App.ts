import "bootstrap";
import "./css/bootstrap.min.css";
import type { User } from "firebase/auth";
import { connectAuthEmulator } from "firebase/auth";
import { signInWithGoogle, signOutCurrentUser, watchAuthChanges } from "./auth";
import { initializeFirebase, type FirebaseInstance } from "./firebase";
import { appConfig } from "./config";
import type { AppConfig } from "./config.types";
import type { ContentRecord, UserProfile } from "./types";
import { isDebugMode, navigateTo, qsStrict } from "./utils";
import { getUser } from "./resolvers";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectStorageEmulator, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Client } from "./api/client";
import { createContent, createContentUploadUrl, listMyContents } from "./api/contents";
import { createUser } from "./api/users";

type Route = { name: "top" } | { name: "login" } | { name: "my" } | { name: "my-edit" } | { name: "my-contents" };

interface AppState {
	route: Route;
	user: User | null;
	loading: boolean;
	profile: UserProfile | null;
	profileLoaded: boolean;
	profileLoading: boolean;
	needsProfile: boolean;
	contents: ContentRecord[];
	contentsLoaded: boolean;
	contentsLoading: boolean;
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
			contents: [],
			contentsLoaded: false,
			contentsLoading: false,
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
				contents: [],
				contentsLoaded: false,
				contentsLoading: false,
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
		connectStorageEmulator(this.firebase.storage, "localhost", 9199);
	}

	parseRoute(): Route {
		const path = window.location.pathname || "/";
		if (path === "/") {
			return { name: "top" };
		}
		if (path.startsWith("/login")) {
			return { name: "login" };
		}
		if (path.startsWith("/my/contents")) {
			return { name: "my-contents" };
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
			case "my-contents":
				await this.renderMyContents();
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

		if (this.state.contentsLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.contentsLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMyContents();
			await this.render();
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

	async renderMyContents() {
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

		this.renderContentCreate();
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

	async loadMyContents() {
		const currentUser = this.state.user;
		if (!currentUser || this.state.contentsLoading) {
			return;
		}
		this.state = { ...this.state, contentsLoading: true };
		try {
			const response = await listMyContents(this.apiClient);
			const contents = response.data.contents ?? [];
			const getMillis = (value: unknown) => {
				if (value == null) return 0;
				if (typeof value === "number") return value;
				if (value instanceof Date) return value.getTime();
				if (typeof (value as { toDate?: () => Date }).toDate === "function") {
					return (value as { toDate: () => Date }).toDate().getTime();
				}
				const seconds =
					(value as { seconds?: number; _seconds?: number }).seconds ??
					(value as { _seconds?: number })._seconds;
				const nanoseconds =
					(value as { nanoseconds?: number; _nanoseconds?: number }).nanoseconds ??
					(value as { _nanoseconds?: number })._nanoseconds ??
					0;
				if (typeof seconds === "number") {
					return seconds * 1000 + Math.floor(nanoseconds / 1e6);
				}
				return 0;
			};
			contents.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
			this.state = {
				...this.state,
				contents,
				contentsLoaded: true,
				contentsLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				contentsLoaded: true,
				contentsLoading: false,
			};
			this.showToast((err as Error).message || "コンテンツの取得に失敗しました", "error");
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

	renderContentCreate() {
		const profileName = this.escapeHtml(this.state.profile?.name ?? "-");
		this.setContent(`
			<div class="row justify-content-center">
				<div class="col-md-8 col-lg-6">
					<div class="card shadow-sm">
						<div class="card-body">
							<div class="d-flex align-items-start justify-content-between mb-3">
								<div>
									<div class="agd-label">投稿</div>
									<h1 class="h5 mb-0">${profileName} のコンテンツ投稿</h1>
								</div>
								<button id="back-to-my" class="btn btn-outline-secondary btn-sm" type="button">戻る</button>
							</div>
							<form id="content-create-form" class="d-grid gap-3">
								<div>
									<label class="form-label" for="content-title">コンテンツ名</label>
									<input id="content-title" class="form-control" type="text" placeholder="コンテンツ名を入力" required />
								</div>
								<div>
									<label class="form-label" for="content-description">説明</label>
									<textarea id="content-description" class="form-control" rows="4" placeholder="説明を入力"></textarea>
								</div>
								<div>
									<label class="form-label" for="content-zip">ZIP ファイル</label>
									<input
										id="content-zip"
										class="form-control"
										type="file"
										accept=".zip,application/zip,application/x-zip-compressed"
										required
									/>
								</div>
								<div>
									<label class="form-label" for="content-thumb">サムネイル画像</label>
									<input
										id="content-thumb"
										class="form-control"
										type="file"
										accept="image/png,image/jpeg,image/webp"
										required
									/>
								</div>
								<div>
									<label class="form-label">サムネプレビュー</label>
									<div class="border rounded p-3 bg-light text-center">
										<img id="content-thumb-preview" class="img-fluid agd-thumb" alt="サムネプレビュー" style="display: none;" />
										<div id="content-thumb-placeholder" class="text-secondary">サムネプレビュー</div>
									</div>
								</div>
								<div class="d-grid">
									<button id="content-submit" class="btn btn-primary" type="submit">投稿</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			</div>
		`);

		const backBtn = qsStrict<HTMLButtonElement>("#back-to-my");
		backBtn.addEventListener("click", () => {
			navigateTo("/my");
		});

		const form = qsStrict<HTMLFormElement>("#content-create-form");
		const titleInput = qsStrict<HTMLInputElement>("#content-title");
		const descInput = qsStrict<HTMLTextAreaElement>("#content-description");
		const zipInput = qsStrict<HTMLInputElement>("#content-zip");
		const thumbInput = qsStrict<HTMLInputElement>("#content-thumb");
		const previewImg = qsStrict<HTMLImageElement>("#content-thumb-preview");
		const previewPlaceholder = qsStrict<HTMLDivElement>("#content-thumb-placeholder");
		const submitBtn = qsStrict<HTMLButtonElement>("#content-submit");
		titleInput.focus();

		let previewUrl: string | null = null;
		const updatePreview = () => {
			const file = thumbInput.files?.[0] ?? null;
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				previewUrl = null;
			}
			if (!file) {
				previewImg.style.display = "none";
				previewImg.src = "";
				previewPlaceholder.style.display = "block";
				return;
			}
			previewUrl = URL.createObjectURL(file);
			previewImg.src = previewUrl;
			previewImg.style.display = "block";
			previewPlaceholder.style.display = "none";
		};
		thumbInput.addEventListener("change", updatePreview);

		const maxZipSize = 200 * 1024 * 1024;
		const maxThumbSize = 20 * 1024 * 1024;
		const cacheControl = "public,max-age=604800,immutable";
		const zipMimeTypes = ["application/zip", "application/x-zip-compressed"];
		const imageMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
		const isZipFile = (file: File) => {
			const name = file.name.toLowerCase();
			const hasZipExt = name.endsWith(".zip");
			if (!file.type) {
				return hasZipExt;
			}
			return zipMimeTypes.includes(file.type) || hasZipExt;
		};
		const isImageFile = (file: File) => {
			const name = file.name.toLowerCase();
			const hasImageExt = [".png", ".jpg", ".jpeg", ".webp"].some((ext) => name.endsWith(ext));
			if (!file.type) {
				return hasImageExt;
			}
			return imageMimeTypes.includes(file.type) || hasImageExt;
		};
		const buildStorageUrl = (filePath: string) => {
			const bucket = this.firebase.storage.app.options.storageBucket;
			if (!bucket) {
				throw new Error("storageBucketが設定されていません");
			}
			return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
		};
		const uploadFile = async (file: File, kind: "zip" | "thumbnail") => {
			const mimeType = file.type || (kind === "zip" ? "application/zip" : "image/png");
			if (isDebugMode()) {
				const currentUser = this.state.user;
				if (!currentUser) {
					throw new Error("ログインが必要です");
				}
				const safeName = file.name.replace(/[\\/]/g, "_");
				const objectPath = `uploads/${currentUser.uid}/contents/${kind}/${Date.now()}-${safeName}`;
				const storageRef = ref(this.firebase.storage, objectPath);
				await uploadBytes(storageRef, file, {
					contentType: mimeType,
					cacheControl,
				});
				return getDownloadURL(storageRef);
			}

			const uploadInfo = await createContentUploadUrl(this.apiClient, { kind, mimeType });
			const maxSize = kind === "zip" ? maxZipSize : maxThumbSize;
			const uploadResponse = await fetch(uploadInfo.data.url, {
				method: "PUT",
				headers: {
					"Content-Type": mimeType,
					"Cache-Control": cacheControl,
					"x-goog-content-length-range": `0,${maxSize}`,
				},
				body: file,
			});
			if (uploadResponse.ok === false) {
				throw new Error(`ファイルのアップロードに失敗しました: ${uploadResponse.statusText}`);
			}
			return buildStorageUrl(uploadInfo.data.filePath);
		};

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const title = titleInput.value.trim();
			if (!title) {
				this.showToast("コンテンツ名を入力してください", "error");
				titleInput.focus();
				return;
			}
			const zipFile = zipInput.files?.[0];
			if (!zipFile) {
				this.showToast("ZIPファイルを選択してください", "error");
				return;
			}
			if (!isZipFile(zipFile)) {
				this.showToast("ZIPファイル形式のみ対応しています", "error");
				return;
			}
			if (zipFile.size > maxZipSize) {
				this.showToast("ZIPファイルのサイズが大きすぎます", "error");
				return;
			}
			const thumbFile = thumbInput.files?.[0];
			if (!thumbFile) {
				this.showToast("サムネイル画像を選択してください", "error");
				return;
			}
			if (!isImageFile(thumbFile)) {
				this.showToast("サムネイル画像はPNG/JPEG/WEBPのみ対応しています", "error");
				return;
			}
			if (thumbFile.size > maxThumbSize) {
				this.showToast("サムネイル画像のサイズが大きすぎます", "error");
				return;
			}

			submitBtn.disabled = true;
			const submitLabel = submitBtn.textContent;
			submitBtn.textContent = "投稿中...";
			try {
				const zipUrl = await uploadFile(zipFile, "zip");
				const thumbnailUrl = await uploadFile(thumbFile, "thumbnail");
				const description = descInput.value.trim();
				await createContent(this.apiClient, {
					title,
					description: description ? description : undefined,
					zipUrl,
					thumbnailUrl,
				});
				this.showToast("投稿しました");
				this.state = {
					...this.state,
					contents: [],
					contentsLoaded: false,
					contentsLoading: false,
				};
				navigateTo("/my");
			} catch (err) {
				this.showToast((err as Error).message || "投稿に失敗しました", "error");
			} finally {
				submitBtn.disabled = false;
				submitBtn.textContent = submitLabel || "投稿";
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
		const contents = this.state.contents;
		const contentsHtml =
			contents.length === 0
				? '<div class="agd-empty">コンテンツはまだありません。</div>'
				: `
					<div class="d-grid gap-3">
						${contents
							.map((content) => {
								const title = this.escapeHtml(content.title);
								const description = content.description
									? `<div class="text-secondary small mt-1">${this.escapeHtml(content.description)}</div>`
									: "";
								const contentCreatedAt = this.formatTimestamp(content.createdAt);
								const thumbnail = content.thumbnailUrl
									? `<img class="agd-thumb-sm rounded" src="${this.escapeHtml(content.thumbnailUrl)}" alt="${title}" />`
									: `<div class="agd-thumb-sm rounded bg-light d-flex align-items-center justify-content-center text-secondary">-</div>`;
								const zipLink = content.zipUrl
									? `<a class="btn btn-sm btn-outline-primary" href="${this.escapeHtml(
											content.zipUrl,
										)}" target="_blank" rel="noopener">ZIP</a>`
									: "";
								return `
									<div class="card shadow-sm">
										<div class="card-body">
											<div class="d-flex gap-3 align-items-start">
												${thumbnail}
												<div class="flex-grow-1">
													<div class="fw-semibold">${title}</div>
													<div class="text-secondary small">作成日: ${contentCreatedAt}</div>
													${description}
												</div>
												${zipLink}
											</div>
										</div>
									</div>
								`;
							})
							.join("")}
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
			<div class="d-flex justify-content-center mb-3">
				<button id="create-content" class="btn btn-primary">投稿</button>
			</div>
			<div class="card shadow-sm">
				<div class="card-body">
					<div class="d-flex align-items-center justify-content-between mb-3">
						<h2 class="h6 mb-0">コンテンツ一覧</h2>
					</div>
					${contentsHtml}
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

		const createBtn = qsStrict<HTMLButtonElement>("#create-content");
		createBtn.addEventListener("click", () => {
			navigateTo("/my/contents");
		});

		const editBtn = qsStrict<HTMLButtonElement>("#edit-profile");
		editBtn.addEventListener("click", () => {
			navigateTo("/my/edit");
		});
	}

	formatTimestamp(value: unknown) {
		if (!value) return "-";
		if (value instanceof Date) {
			return value.toLocaleString("vi-VN");
		}
		if (typeof value === "number") {
			return new Date(value).toLocaleString("vi-VN");
		}
		if (typeof (value as { toDate?: () => Date }).toDate === "function") {
			return (value as { toDate: () => Date }).toDate().toLocaleString("vi-VN");
		}
		const seconds =
			(value as { seconds?: number; _seconds?: number }).seconds ?? (value as { _seconds?: number })._seconds;
		const nanoseconds =
			(value as { nanoseconds?: number; _nanoseconds?: number }).nanoseconds ??
			(value as { _nanoseconds?: number })._nanoseconds ??
			0;
		if (typeof seconds === "number") {
			return new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6)).toLocaleString("vi-VN");
		}
		return "-";
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
