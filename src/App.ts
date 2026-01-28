import "bootstrap";
import "./css/bootstrap.min.css";
import { connectAuthEmulator } from "firebase/auth";
import { signInWithGoogle, signOutCurrentUser, watchAuthChanges } from "./auth";
import { initializeFirebase, type FirebaseInstance } from "./firebase";
import { appConfig } from "./config";
import type { AppConfig } from "./config.types";
import type { AppState, ContentRecord, UserProfile } from "./types";
import * as utils from "./utils";
import { getUser } from "./resolvers";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectStorageEmulator, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Client } from "./api/client";
import type { UpdateContentInput } from "./api/contents";
import { createContent, createContentUploadUrl, getContentById, listMyContents, updateContent } from "./api/contents";
import { createFeedback, createUser, getUserById, listUserContents } from "./api/users";
import { loadContentFiles } from "./downloader";

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
			useEmulator: utils.isDebugMode(),
		});
		this.rootEl = utils.qsStrict<HTMLElement>("#app-root");
		this.toastEl = utils.qsStrict<HTMLElement>("#toast");
		this.state = {
			route: utils.parseRoute(),
			user: null,
			loading: true,
			profile: null,
			profileLoaded: false,
			profileLoading: false,
			needsProfile: false,
			contents: [],
			contentsLoaded: false,
			contentsLoading: false,
			userPageId: null,
			userPageProfile: null,
			userPageProfileLoaded: false,
			userPageProfileLoading: false,
			userPageContents: [],
			userPageContentsLoaded: false,
			userPageContentsLoading: false,
			contentViewId: null,
			contentView: null,
			contentViewLoaded: false,
			contentViewLoading: false,
			contentViewOwnerId: null,
			contentViewOwner: null,
			contentViewOwnerLoaded: false,
			contentViewOwnerLoading: false,
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
				userPageId: null,
				userPageProfile: null,
				userPageProfileLoaded: false,
				userPageProfileLoading: false,
				userPageContents: [],
				userPageContentsLoaded: false,
				userPageContentsLoading: false,
				contentViewId: null,
				contentView: null,
				contentViewLoaded: false,
				contentViewLoading: false,
				contentViewOwnerId: null,
				contentViewOwner: null,
				contentViewOwnerLoaded: false,
				contentViewOwnerLoading: false,
			};
			await this.render();
		});

		window.addEventListener("popstate", async () => {
			this.state = { ...this.state, route: utils.parseRoute() };
			await this.render();
		});

		await this.render();
	}

	connectEmulatorIfDebug() {
		if (!utils.isDebugMode()) return;
		connectAuthEmulator(this.firebase.auth, "http://localhost:9099");
		connectFirestoreEmulator(this.firebase.firestore, "localhost", 8080);
		connectStorageEmulator(this.firebase.storage, "localhost", 9199);
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
			case "content-edit":
				await this.renderContentEdit();
				break;
			case "content-view":
				await this.renderContentView();
				break;
			case "my":
				await this.renderMy();
				break;
			case "user":
				await this.renderUserPage();
				break;
			case "top":
			default:
				this.redirectFromRoot();
				break;
		}
	}

	redirectFromRoot() {
		if (this.state.user) {
			utils.navigateTo("/my");
			return;
		}
		utils.navigateTo("/login");
	}

	async renderMy() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			utils.navigateTo("/login");
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

	async renderUserPage() {
		const route = this.state.route;
		const userId = route.name === "user" ? route.userId : "";
		if (!userId) {
			utils.navigateTo("/");
			return;
		}

		if (this.state.userPageId !== userId) {
			this.state = {
				...this.state,
				userPageId: userId,
				userPageProfile: null,
				userPageProfileLoaded: false,
				userPageProfileLoading: false,
				userPageContents: [],
				userPageContentsLoaded: false,
				userPageContentsLoading: false,
			};
		}

		if (this.state.userPageProfileLoading || this.state.userPageContentsLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.userPageProfileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserPageProfile(userId);
			await this.render();
			return;
		}

		if (!this.state.userPageProfile) {
			this.setContent('<div class="text-center text-secondary">ユーザーが見つかりません。</div>');
			return;
		}

		if (!this.state.userPageContentsLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserPageContents(userId);
			await this.render();
			return;
		}

		const isOwnPage = this.state.user?.uid === userId;
		const isSignedIn = this.state.user !== null;
		this.renderMyContent(this.state.userPageProfile, this.state.userPageContents, {
			allowEdit: false,
			showActions: false,
			showCreate: false,
			nameLink: isOwnPage ? "/my" : null,
			showFeedbackForm: !isOwnPage && isSignedIn,
			showFeedbackLoginPrompt: !isOwnPage && !isSignedIn,
		});
	}

	async renderMyEdit() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			utils.navigateTo("/login");
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
			utils.navigateTo("/login");
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

	async renderContentEdit() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			utils.navigateTo("/login");
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

		const route = this.state.route;
		const contentId = route.name === "content-edit" ? route.contentId : "";
		const content = this.state.contents.find((item) => item.id === contentId);
		if (!content) {
			this.showToast("コンテンツが見つかりません", "error");
			utils.navigateTo("/my");
			return;
		}

		this.renderContentCreate(content);
	}

	async renderContentView() {
		const route = this.state.route;
		const contentId = route.name === "content-view" ? route.contentId : "";
		if (!contentId) {
			utils.navigateTo("/");
			return;
		}

		if (this.state.contentViewId !== contentId) {
			this.state = {
				...this.state,
				contentViewId: contentId,
				contentView: null,
				contentViewLoaded: false,
				contentViewLoading: false,
			};
		}

		if (this.state.contentViewLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.contentViewLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadContentView(contentId);
			await this.render();
			return;
		}

		if (!this.state.contentView) {
			this.setContent('<div class="text-center text-secondary">コンテンツが見つかりません。</div>');
			return;
		}

		const content = this.state.contentView;
		const ownerId = content.ownerId;
		if (this.state.contentViewOwnerId !== ownerId) {
			this.state = {
				...this.state,
				contentViewOwnerId: ownerId,
				contentViewOwner: null,
				contentViewOwnerLoaded: false,
				contentViewOwnerLoading: false,
			};
		}
		if (!this.state.contentViewOwnerLoaded && !this.state.contentViewOwnerLoading) {
			void this.loadContentViewOwner(ownerId);
		}

		this.renderContentDetail(content, this.state.contentViewOwner);
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
			utils.sortContentsByCreatedAt(contents);
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

	async loadUserPageProfile(userId: string) {
		if (this.state.userPageProfileLoading) {
			return;
		}
		this.state = { ...this.state, userPageProfileLoading: true };
		try {
			const response = await getUserById(this.apiClient, userId);
			const profile = response.data.user ?? null;
			this.state = {
				...this.state,
				userPageProfile: profile,
				userPageProfileLoaded: true,
				userPageProfileLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				userPageProfileLoaded: true,
				userPageProfileLoading: false,
			};
			this.showToast((err as Error).message || "ユーザー情報の取得に失敗しました", "error");
		}
	}

	async loadUserPageContents(userId: string) {
		if (this.state.userPageContentsLoading) {
			return;
		}
		this.state = { ...this.state, userPageContentsLoading: true };
		try {
			const response = await listUserContents(this.apiClient, userId);
			const contents = response.data.contents ?? [];
			utils.sortContentsByCreatedAt(contents);
			this.state = {
				...this.state,
				userPageContents: contents,
				userPageContentsLoaded: true,
				userPageContentsLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				userPageContentsLoaded: true,
				userPageContentsLoading: false,
			};
			this.showToast((err as Error).message || "コンテンツの取得に失敗しました", "error");
		}
	}

	async loadContentView(contentId: string) {
		if (this.state.contentViewLoading) {
			return;
		}
		const cachedContent =
			this.state.contents.find((item) => item.id === contentId) ??
			this.state.userPageContents.find((item) => item.id === contentId);
		if (cachedContent) {
			this.state = {
				...this.state,
				contentView: cachedContent,
				contentViewLoaded: true,
				contentViewLoading: false,
			};
			return;
		}
		this.state = { ...this.state, contentViewLoading: true };
		try {
			const response = await getContentById(this.apiClient, contentId);
			this.state = {
				...this.state,
				contentView: response.data.content ?? null,
				contentViewLoaded: true,
				contentViewLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				contentViewLoaded: true,
				contentViewLoading: false,
			};
			this.showToast((err as Error).message || "コンテンツの取得に失敗しました", "error");
		}
	}

	async loadContentViewOwner(userId: string) {
		if (this.state.contentViewOwnerLoading) {
			return;
		}
		this.state = { ...this.state, contentViewOwnerLoading: true };
		try {
			const response = await getUserById(this.apiClient, userId);
			this.state = {
				...this.state,
				contentViewOwner: response.data.user ?? null,
				contentViewOwnerLoaded: true,
				contentViewOwnerLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				contentViewOwnerLoaded: true,
				contentViewOwnerLoading: false,
			};
			this.showToast((err as Error).message || "ユーザー情報の取得に失敗しました", "error");
		}
		await this.render();
	}

	renderMyProfile() {
		this.renderMyContent(this.state.profile, this.state.contents);
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

		const form = utils.qsStrict<HTMLFormElement>("#profile-setup-form");
		const nameInput = utils.qsStrict<HTMLInputElement>("#profile-name");
		const saveBtn = utils.qsStrict<HTMLButtonElement>("#profile-save");
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
					utils.navigateTo("/my");
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

	renderContentCreate(content?: ContentRecord) {
		const isEdit = Boolean(content);
		const profileName = utils.escapeHtml(this.state.profile?.name ?? "-");
		const label = isEdit ? "編集" : "投稿";
		const title = isEdit ? `${profileName} のコンテンツ編集` : `${profileName} のコンテンツ投稿`;
		const submitLabel = isEdit ? "更新" : "投稿";
		const requiredAttr = isEdit ? "" : "required";
		const warningLines = isEdit ? (content?.warnings ?? []).filter(Boolean) : [];
		const warningText = warningLines.map((line) => utils.escapeHtml(line)).join("<br>");
		const warningsHtml =
			warningLines.length > 0 ? `<div class="alert alert-warning small mt-2">警告: ${warningText}</div>` : "";
		const stateLabelHtml = isEdit ? utils.getContentStateLabel(content?.state) : "";
		const zipName = content?.zipUrl ? utils.getFileNameFromUrl(content.zipUrl) : "";
		const existingZipLink =
			isEdit && content?.zipUrl && content?.state !== "failed"
				? `<div class="small mt-2">現在のZIP: <a href="${utils.escapeHtml(
						content.zipUrl,
					)}" target="_blank" rel="noopener">${utils.escapeHtml(zipName)}</a></div>`
				: "";
		this.setContent(`
			<div class="row justify-content-center">
				<div class="col-md-8 col-lg-6">
					<div class="card shadow-sm">
						<div class="card-body">
							<div class="d-flex align-items-start justify-content-between mb-3">
								<div>
									<div class="agd-label">${label}</div>
									<h1 class="h5 mb-0">${title}</h1>
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
										${requiredAttr}
									/>
									${existingZipLink}
									${warningsHtml}
									${stateLabelHtml}
								</div>
								<div>
									<label class="form-label" for="content-thumb">サムネイル画像</label>
									<input
										id="content-thumb"
										class="form-control"
										type="file"
										accept="image/png,image/jpeg,image/webp"
										${requiredAttr}
									/>
								</div>
								<div>
									<label class="form-label">サムネプレビュー</label>
									<div class="d-flex justify-content-center border rounded p-3 bg-light text-center">
										<img id="content-thumb-preview" class="img-fluid agd-thumb" alt="サムネプレビュー" style="display: none;" />
										<div id="content-thumb-placeholder" class="text-secondary">サムネプレビュー</div>
									</div>
								</div>
								<div class="d-grid">
									<button id="content-submit" class="btn btn-primary" type="submit">${submitLabel}</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			</div>
		`);

		const backBtn = utils.qsStrict<HTMLButtonElement>("#back-to-my");
		backBtn.addEventListener("click", () => {
			utils.navigateTo("/my");
		});

		const form = utils.qsStrict<HTMLFormElement>("#content-create-form");
		const titleInput = utils.qsStrict<HTMLInputElement>("#content-title");
		const descInput = utils.qsStrict<HTMLTextAreaElement>("#content-description");
		const zipInput = utils.qsStrict<HTMLInputElement>("#content-zip");
		const thumbInput = utils.qsStrict<HTMLInputElement>("#content-thumb");
		const previewImg = utils.qsStrict<HTMLImageElement>("#content-thumb-preview");
		const previewPlaceholder = utils.qsStrict<HTMLDivElement>("#content-thumb-placeholder");
		const submitBtn = utils.qsStrict<HTMLButtonElement>("#content-submit");
		const existingZipUrl = content?.zipUrl ?? "";
		const hasExtractedPath = Boolean(content?.extractedPath);
		const existingThumbUrl = content?.thumbnailUrl ?? "";
		titleInput.value = content?.title ?? "";
		descInput.value = content?.description ?? "";
		titleInput.focus();

		let previewUrl: string | null = null;
		const updatePreview = () => {
			const file = thumbInput.files?.[0] ?? null;
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				previewUrl = null;
			}
			if (!file) {
				if (existingThumbUrl) {
					previewImg.src = existingThumbUrl;
					previewImg.style.display = "block";
					previewPlaceholder.style.display = "none";
				} else {
					previewImg.style.display = "none";
					previewImg.src = "";
					previewPlaceholder.style.display = "block";
				}
				return;
			}
			previewUrl = URL.createObjectURL(file);
			previewImg.src = previewUrl;
			previewImg.style.display = "block";
			previewPlaceholder.style.display = "none";
		};
		thumbInput.addEventListener("change", updatePreview);
		if (existingThumbUrl) {
			updatePreview();
		}

		const maxZipSize = 20 * 1024 * 1024;
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
		const uploadFile = async (file: File, kind: "zip" | "thumbnail", contentId: string) => {
			if (!contentId) {
				throw new Error("コンテンツIDが不正です");
			}
			const mimeType = file.type || (kind === "zip" ? "application/zip" : "image/png");
			if (utils.isDebugMode()) {
				const currentUser = this.state.user;
				if (!currentUser) {
					throw new Error("ログインが必要です");
				}
				if (/[\\/]/.test(file.name)) {
					throw new Error("ファイル名に使用できない文字が含まれています");
				}
				const objectName = kind === "zip" ? file.name : `${Date.now()}-${file.name}`;
				const objectPath = `uploads/${currentUser.uid}/contents/${kind}/${contentId}/${objectName}`;
				const storageRef = ref(this.firebase.storage, objectPath);
				await uploadBytes(storageRef, file, {
					contentType: mimeType,
					cacheControl,
				});
				return getDownloadURL(storageRef);
			}

			const uploadInfo = await createContentUploadUrl(this.apiClient, {
				kind,
				mimeType,
				fileName: kind === "zip" ? file.name : undefined,
				contentId,
			});
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
			if (!zipFile && !existingZipUrl && !hasExtractedPath) {
				this.showToast("ZIPファイルを選択してください", "error");
				return;
			}
			if (zipFile) {
				if (!isZipFile(zipFile)) {
					this.showToast("ZIPファイル形式のみ対応しています", "error");
					return;
				}
				if (zipFile.size > maxZipSize) {
					this.showToast("ZIPファイルのサイズが大きすぎます", "error");
					return;
				}
			}
			const thumbFile = thumbInput.files?.[0];
			if (!thumbFile && !existingThumbUrl) {
				this.showToast("サムネイル画像を選択してください", "error");
				return;
			}
			if (thumbFile) {
				if (!isImageFile(thumbFile)) {
					this.showToast("サムネイル画像はPNG/JPEG/WEBPのみ対応しています", "error");
					return;
				}
				if (thumbFile.size > maxThumbSize) {
					this.showToast("サムネイル画像のサイズが大きすぎます", "error");
					return;
				}
			}

			submitBtn.disabled = true;
			const submitLabelText = submitBtn.textContent;
			submitBtn.textContent = isEdit ? "更新中..." : "投稿中...";
			try {
				const description = descInput.value.trim();
				const descriptionValue = isEdit ? description : description || undefined;
				const contentId = isEdit
					? content?.id
					: (await createContent(this.apiClient, { title, description: descriptionValue })).data.contentId;
				if (!contentId) {
					throw new Error("コンテンツIDが不正です");
				}
				const zipUrl = zipFile ? await uploadFile(zipFile, "zip", contentId) : existingZipUrl || undefined;
				const thumbnailUrl = thumbFile
					? await uploadFile(thumbFile, "thumbnail", contentId)
					: existingThumbUrl;
				if (isEdit && content) {
					const updatePayload: UpdateContentInput = {
						title,
						description: descriptionValue,
						thumbnailUrl,
					};
					if (zipUrl) {
						updatePayload.zipUrl = zipUrl;
					}
					await updateContent(this.apiClient, content.id, updatePayload);
					this.showToast("更新しました");
				} else {
					if (!zipUrl) {
						throw new Error("ZIPファイルを選択してください");
					}
					await updateContent(this.apiClient, contentId, {
						title,
						description: descriptionValue,
						zipUrl,
						thumbnailUrl,
					});
					this.showToast("投稿しました");
				}
				this.state = {
					...this.state,
					contents: [],
					contentsLoaded: false,
					contentsLoading: false,
				};
				utils.navigateTo("/my");
			} catch (err) {
				this.showToast(
					(err as Error).message || (isEdit ? "更新に失敗しました" : "投稿に失敗しました"),
					"error",
				);
			} finally {
				submitBtn.disabled = false;
				submitBtn.textContent = submitLabelText || submitLabel;
			}
		});
	}

	renderContentDetail(content: ContentRecord, owner: UserProfile | null) {
		const title = utils.escapeHtml(content.title);
		const ownerName = utils.escapeHtml(owner?.name ?? "-");
		const ownerLink = `<a id="content-owner-link" class="text-decoration-none text-reset" href="/users/${encodeURIComponent(
			content.ownerId,
		)}">${ownerName}</a>`;
		const descriptionText = content.description?.trim() ?? "";
		const description = utils.escapeHtml(descriptionText);
		const descriptionHtml = description
			? `<div class="agd-description text-start">${description}</div>`
			: '<div class="text-secondary">説明はありません</div>';
		const warningLines = (content.warnings ?? []).filter(Boolean);
		const warningText = warningLines.map((line) => utils.escapeHtml(line)).join("<br>");
		const warningsHtml =
			warningLines.length > 0 ? `<div class="alert alert-warning small mt-3">警告: ${warningText}</div>` : "";
		const stateLabelHtml = utils.getContentStateLabel(content.state);
		const thumbnail = content.thumbnailUrl
			? `<img class="img-fluid agd-thumb" src="${utils.escapeHtml(content.thumbnailUrl)}" alt="${title}" />`
			: '<div class="text-secondary">サムネイルがありません</div>';
		const createdAt = utils.formatTimestamp(content.createdAt);
		const updatedAt = utils.formatTimestamp(content.updatedAt);
		const metaLine = `${ownerLink} が ${createdAt} に投稿 (最終更新: ${updatedAt})`;
		const canDownload = content.state === "ok" && content.trusted !== false && Boolean(content.extractedPath);
		const downloadHtml = canDownload
			? `<div class="mt-4">
					<div class="fw-semibold mb-2">ダウンロード</div>
					<div id="content-files" class="small text-secondary">読み込み中...</div>
				</div>`
			: "";
		this.setContent(`
			<div class="row justify-content-center">
				<div class="col-md-8 col-lg-6">
					<div class="card shadow-sm">
						<div class="card-body">
							<div class="d-flex align-items-start justify-content-between mb-4">
								<div>
									<h1 class="h4 mb-1">${title}</h1>
									<div class="agd-meta">${metaLine}</div>
								</div>
							</div>
							<div class="d-flex justify-content-center mb-4">
								${thumbnail}
							</div>
							${descriptionHtml}
							${warningsHtml}
							${stateLabelHtml}
							${downloadHtml}
						</div>
					</div>
				</div>
			</div>
		`);

		const ownerLinkEl = utils.qsStrict<HTMLAnchorElement>("#content-owner-link");
		ownerLinkEl.addEventListener("click", (event) => {
			event.preventDefault();
			utils.navigateTo(`/users/${encodeURIComponent(content.ownerId)}`);
		});
		if (canDownload) {
			const container = utils.qs<HTMLElement>("#content-files");
			if (container) {
				void loadContentFiles({
					content,
					storage: this.firebase.storage,
					container,
					isDebugMode: utils.isDebugMode(),
					messages: {
						unavailable: "ダウンロードできません",
						gameJsonFailed: "game.jsonの取得に失敗しました",
						listFailed: "ファイル一覧の取得に失敗しました",
					},
				});
			}
		}
	}

	renderMyContent(
		profile: UserProfile | null,
		contents: ContentRecord[],
		options: {
			allowEdit?: boolean;
			showActions?: boolean;
			showCreate?: boolean;
			nameLink?: string | null;
			showFeedbackForm?: boolean;
			showFeedbackLoginPrompt?: boolean;
		} = {},
	) {
		const allowEdit = options.allowEdit ?? true;
		const showActions = options.showActions ?? true;
		const showCreate = options.showCreate ?? true;
		const showFeedbackForm = options.showFeedbackForm ?? false;
		const showFeedbackLoginPrompt = options.showFeedbackLoginPrompt ?? false;
		const loginHref = `/login?next=${encodeURIComponent(window.location.pathname || "/")}${
			utils.isDebugMode() ? "&debug=true" : ""
		}`;
		const showLogout = showActions && this.state.user !== null;
		const showEditProfile = showActions && allowEdit;
		const showCreateButton = showCreate && this.state.user !== null;
		const nameLink = options.nameLink ?? null;
		const currentUserId = profile?.uid ?? this.state.user?.uid ?? "";
		const name = profile?.name ?? "-";
		const createdAt = utils.formatTimestamp(profile?.createdAt);
		const safeName = utils.escapeHtml(name);
		const nameHtml = nameLink
			? `<a id="my-page-link" class="text-decoration-none text-reset" href="${utils.escapeHtml(
					nameLink,
				)}">${safeName} マイページ</a>`
			: `${safeName} マイページ`;
		const profileNotice = profile
			? ""
			: `
			<div class="alert alert-warning d-flex align-items-center" role="alert">
				<span>ユーザー情報が未登録です。バックエンドで作成してください。</span>
			</div>
		`;
		const contentsHtml =
			contents.length === 0
				? '<div class="agd-empty">コンテンツはまだありません。</div>'
				: `
					<div class="d-grid gap-3">
						${contents
							.map((content) => {
								const title = utils.escapeHtml(content.title);
								const description = content.description
									? `<div class="text-secondary small mt-1">${utils.escapeHtml(content.description)}</div>`
									: "";
								const stateLabel = utils.getStateListContentLabel(content.state);
								const stateLabelHtml = stateLabel;
								const contentLink = `/contents/${encodeURIComponent(content.id)}`;
								const titleLink = `<a class="text-decoration-none text-reset js-content-link" href="${utils.escapeHtml(
									contentLink,
								)}" data-content-id="${utils.escapeHtml(content.id)}">${title}</a>`;
								const contentCreatedAt = utils.formatTimestamp(content.createdAt);
								const thumbnail = content.thumbnailUrl
									? `<img class="agd-thumb-sm rounded" src="${utils.escapeHtml(content.thumbnailUrl)}" alt="${title}" />`
									: `<div class="agd-thumb-sm rounded bg-light d-flex align-items-center justify-content-center text-secondary">-</div>`;
								const thumbLink = `<a class="js-content-link" href="${utils.escapeHtml(
									contentLink,
								)}" data-content-id="${utils.escapeHtml(content.id)}">${thumbnail}</a>`;
								const editButton = allowEdit
									? `<button class="btn btn-sm btn-outline-secondary js-edit-content" type="button" data-content-id="${utils.escapeHtml(
											content.id,
										)}">編集</button>`
									: "";
								return `
									<div class="card shadow-sm">
										<div class="card-body">
											<div class="d-flex gap-3 align-items-start">
												${thumbLink}
												<div class="flex-grow-1">
													<div class="fw-semibold">${titleLink}</div>
													<div class="text-secondary small">作成日: ${contentCreatedAt}</div>
													${description}
													<div class="mt-1">${stateLabelHtml}</div>
												</div>
												${editButton}
											</div>
										</div>
									</div>
								`;
							})
							.join("")}
					</div>
				`;
		const actionsHtml =
			showEditProfile || showLogout
				? `
				<div class="agd-actions">
					${showEditProfile ? '<button id="edit-profile" class="btn btn-outline-primary">編集</button>' : ""}
					${showLogout ? '<button id="logout" class="btn btn-outline-secondary">ログアウト</button>' : ""}
				</div>
			`
				: "";
		const viewProfileHref = currentUserId ? `/users/${encodeURIComponent(currentUserId)}` : "";
		const viewProfileButtonHtml = viewProfileHref
			? `<a id="view-profile" class="btn btn-outline-secondary" href="${utils.escapeHtml(
					viewProfileHref,
				)}">プロフィール表示確認</a>`
			: "";
		const createButtonHtml = showCreateButton
			? `
			<div class="d-flex justify-content-center gap-2 mb-3">
				<button id="create-content" class="btn btn-primary">投稿</button>
				${viewProfileButtonHtml}
			</div>
		`
			: "";
		const feedbackFormHtml = showFeedbackForm
			? `
			<div class="card shadow-sm mt-4">
				<div class="card-body">
					<h2 class="h6 mb-3">このユーザーにコメントを送る</h2>
					<form class="d-grid gap-3">
						<div>
							<label class="form-label" for="feedback-title">件名</label>
							<input id="feedback-title" name="title" class="form-control" type="text" />
						</div>
						<div>
							<label class="form-label" for="feedback-detail">内容</label>
							<textarea id="feedback-detail" name="detail" class="form-control" rows="4"></textarea>
						</div>
						<div class="d-flex justify-content-center">
							<button id="send-feedback" class="btn btn-primary" type="button" data-receiver-id="${utils.escapeHtml(
								profile?.uid ?? "",
							)}">送信</button>
						</div>
					</form>
				</div>
			</div>
		`
			: "";
		const feedbackLoginPromptHtml = showFeedbackLoginPrompt
			? `
			<div class="card shadow-sm mt-4">
				<div class="card-body text-center text-secondary">
					ログインしてコメントしてください。
					<a class="text-decoration-none" href="${utils.escapeHtml(loginHref)}">ログイン</a>
				</div>
			</div>
		`
			: "";

		this.setContent(`
			${profileNotice}
			<div class="agd-my-header">
				<div>
					<div class="agd-user-name">${nameHtml}</div>
					<div class="agd-meta">登録日: ${createdAt}</div>
				</div>
				${actionsHtml}
			</div>
			${createButtonHtml}
			<div class="card shadow-sm">
				<div class="card-body">
					<div class="d-flex align-items-center justify-content-between mb-3">
						<h2 class="h6 mb-0">コンテンツ一覧</h2>
					</div>
					${contentsHtml}
				</div>
			</div>
			${feedbackFormHtml}
			${feedbackLoginPromptHtml}
		`);

		this.bindMyActions();
	}

	bindMyActions() {
		const logoutBtn = utils.qs<HTMLButtonElement>("#logout");
		if (logoutBtn) {
			logoutBtn.addEventListener("click", async () => {
				await signOutCurrentUser(this.firebase);
				utils.navigateTo("/login");
			});
		}

		const createBtn = utils.qs<HTMLButtonElement>("#create-content");
		if (createBtn) {
			createBtn.addEventListener("click", () => {
				utils.navigateTo("/my/contents");
			});
		}

		const editBtn = utils.qs<HTMLButtonElement>("#edit-profile");
		if (editBtn) {
			editBtn.addEventListener("click", () => {
				utils.navigateTo("/my/edit");
			});
		}

		const viewProfileBtn = utils.qs<HTMLAnchorElement>("#view-profile");
		if (viewProfileBtn) {
			viewProfileBtn.addEventListener("click", (event) => {
				event.preventDefault();
				const userId = this.state.profile?.uid ?? this.state.user?.uid;
				if (!userId) return;
				utils.navigateTo(`/users/${encodeURIComponent(userId)}`);
			});
		}

		const myPageLink = utils.qs<HTMLAnchorElement>("#my-page-link");
		if (myPageLink) {
			myPageLink.addEventListener("click", (event) => {
				event.preventDefault();
				utils.navigateTo("/my");
			});
		}

		const contentEditButtons = utils.qsStrictAll<HTMLButtonElement>(this.rootEl, ".js-edit-content");
		contentEditButtons.forEach((button) => {
			const contentId = button.dataset.contentId;
			if (!contentId) return;
			button.addEventListener("click", () => {
				utils.navigateTo(`/contents/${encodeURIComponent(contentId)}/edit`);
			});
		});

		const contentLinks = utils.qsStrictAll<HTMLAnchorElement>(this.rootEl, ".js-content-link");
		contentLinks.forEach((link) => {
			const contentId = link.dataset.contentId;
			if (!contentId) return;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				utils.navigateTo(`/contents/${encodeURIComponent(contentId)}`);
			});
		});

		const sendFeedbackBtn = utils.qs<HTMLButtonElement>("#send-feedback");
		if (sendFeedbackBtn) {
			sendFeedbackBtn.addEventListener("click", async () => {
				const titleInput = utils.qs<HTMLInputElement>("#feedback-title");
				const detailInput = utils.qs<HTMLTextAreaElement>("#feedback-detail");
				const receiverId = sendFeedbackBtn.dataset.receiverId ?? "";
				const title = titleInput?.value.trim() ?? "";
				const detail = detailInput?.value.trim() ?? "";

				if (!this.state.user || !receiverId) {
					this.showToast("送信できませんでした", "error");
					return;
				}

				if (!title || !detail) {
					this.showToast("件名と内容を入力してください", "error");
					return;
				}

				sendFeedbackBtn.disabled = true;
				try {
					await createFeedback(this.apiClient, receiverId, title, detail);
					if (titleInput) titleInput.value = "";
					if (detailInput) detailInput.value = "";
					this.showToast("送信しました");
				} catch (err) {
					this.showToast((err as Error).message, "error");
				} finally {
					sendFeedbackBtn.disabled = false;
				}
			});
		}
	}

	renderLogin() {
		const signedIn = this.state.user !== null;
		const params = new URLSearchParams(window.location.search);
		const nextPath = params.get("next");
		const redirectPath = nextPath && nextPath.startsWith("/") ? nextPath : "/my";
		if (signedIn) {
			utils.navigateTo(redirectPath);
			return;
		}
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

		const loginBtn = utils.qsStrict<HTMLButtonElement>("#login-google");
		loginBtn.addEventListener("click", async () => {
			try {
				await signInWithGoogle(this.firebase);
				this.showToast("ログインしました");
				utils.navigateTo(redirectPath);
			} catch (err) {
				this.showToast((err as Error).message, "error");
			}
		});

		if (signedIn) {
			const logoutBtn = utils.qsStrict<HTMLButtonElement>("#logout");
			logoutBtn.addEventListener("click", async () => {
				await signOutCurrentUser(this.firebase);
				utils.navigateTo("/login");
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
}
