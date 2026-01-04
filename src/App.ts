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
import { createContent, createContentUploadUrl, listMyContents, updateContent } from "./api/contents";
import { createUser } from "./api/users";

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
		const existingZipLink =
			isEdit && content?.zipUrl
				? `<div class="small mt-2">現在のZIP: <a href="${utils.escapeHtml(
						content.zipUrl,
					)}" target="_blank" rel="noopener">${utils.escapeHtml(utils.getFileNameFromUrl(content.zipUrl))}</a></div>`
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
									<div class="border rounded p-3 bg-light text-center">
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
		const uploadFile = async (file: File, kind: "zip" | "thumbnail") => {
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
				const objectPath = `uploads/${currentUser.uid}/contents/${kind}/${objectName}`;
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
				contentId: isEdit ? content?.id : undefined,
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
			if (!zipFile && !existingZipUrl) {
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
				const zipUrl = zipFile ? await uploadFile(zipFile, "zip") : existingZipUrl;
				const thumbnailUrl = thumbFile ? await uploadFile(thumbFile, "thumbnail") : existingThumbUrl;
				const description = descInput.value.trim();
				const descriptionValue = isEdit ? description : description ? description : undefined;
				if (isEdit && content) {
					await updateContent(this.apiClient, content.id, {
						title,
						description: descriptionValue,
						zipUrl,
						thumbnailUrl,
					});
					this.showToast("更新しました");
				} else {
					await createContent(this.apiClient, {
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

	renderMyContent(profile: UserProfile | null) {
		const name = profile?.name ?? "-";
		const createdAt = utils.formatTimestamp(profile?.createdAt);
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
								const title = utils.escapeHtml(content.title);
								const description = content.description
									? `<div class="text-secondary small mt-1">${utils.escapeHtml(content.description)}</div>`
									: "";
								const zipName = content.zipUrl ? utils.getFileNameFromUrl(content.zipUrl) : "";
								const zipLink = content.zipUrl
									? `<a class="small mt-2 d-inline-block" href="${utils.escapeHtml(
											content.zipUrl,
										)}" target="_blank" rel="noopener">${utils.escapeHtml(zipName)}</a>`
									: "";
								const contentCreatedAt = utils.formatTimestamp(content.createdAt);
								const thumbnail = content.thumbnailUrl
									? `<img class="agd-thumb-sm rounded" src="${utils.escapeHtml(content.thumbnailUrl)}" alt="${title}" />`
									: `<div class="agd-thumb-sm rounded bg-light d-flex align-items-center justify-content-center text-secondary">-</div>`;
								const editButton = `<button class="btn btn-sm btn-outline-secondary js-edit-content" type="button" data-content-id="${utils.escapeHtml(
									content.id,
								)}">編集</button>`;
								return `
									<div class="card shadow-sm">
										<div class="card-body">
											<div class="d-flex gap-3 align-items-start">
												${thumbnail}
												<div class="flex-grow-1">
													<div class="fw-semibold">${title}</div>
													<div class="text-secondary small">作成日: ${contentCreatedAt}</div>
													${description}
													${zipLink}
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

		this.setContent(`
			${profileNotice}
			<div class="agd-my-header">
				<div>
					<div class="agd-user-name">${utils.escapeHtml(name)} マイページ</div>
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
		const logoutBtn = utils.qsStrict<HTMLButtonElement>("#logout");
		logoutBtn.addEventListener("click", async () => {
			await signOutCurrentUser(this.firebase);
			utils.navigateTo("/login");
		});

		const createBtn = utils.qsStrict<HTMLButtonElement>("#create-content");
		createBtn.addEventListener("click", () => {
			utils.navigateTo("/my/contents");
		});

		const editBtn = utils.qsStrict<HTMLButtonElement>("#edit-profile");
		editBtn.addEventListener("click", () => {
			utils.navigateTo("/my/edit");
		});

		const contentEditButtons = utils.qsStrictAll<HTMLButtonElement>(this.rootEl, ".js-edit-content");
		contentEditButtons.forEach((button) => {
			const contentId = button.dataset.contentId;
			if (!contentId) return;
			button.addEventListener("click", () => {
				utils.navigateTo(`/contents/${encodeURIComponent(contentId)}/edit`);
			});
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

		const loginBtn = utils.qsStrict<HTMLButtonElement>("#login-google");
		loginBtn.addEventListener("click", async () => {
			try {
				await signInWithGoogle(this.firebase);
				this.showToast("ログインしました");
				utils.navigateTo("/my");
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
