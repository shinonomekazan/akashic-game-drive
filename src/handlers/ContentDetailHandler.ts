import { getAuth } from "firebase/auth";
import { Firestore } from "firebase/firestore";
import { getDownloadURL, ref, type FirebaseStorage, uploadBytes } from "firebase/storage";
import { Client } from "../api/client";
import { createContentUploadUrl, deleteContent, updateContent } from "../api/manage";
import { getOrCreateModal, pushQueryState, resetBtn, setFormValuesByPropsWithTimeConvert } from "../helpers";
import { getContent } from "../resolvers/contents";
import { ContentRecord, FeedbackRecord } from "../types";
import { isDebugMode, qsStrict } from "../utils";
import { DetailHandler } from "./types";
import { listFeedbacksByContentId } from "../resolvers";
import { convertContentFeedbackToHtmlRow } from "../converters";

const MAX_THUMB_SIZE = 20 * 1024 * 1024;
const CACHE_CONTROL = "public,max-age=604800,immutable";
const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export class ContentDetailHandler extends EventTarget implements DetailHandler {
	firestore: Firestore;
	api: Client;
	storage: FirebaseStorage;
	refresh: () => Promise<void>;

	constructor(firestore: Firestore, api: Client, storage: FirebaseStorage, refresh: () => Promise<void>) {
		super();
		this.firestore = firestore;
		this.api = api;
		this.storage = storage;
		this.refresh = refresh;
	}

	async onDetail(form: HTMLFormElement, id: string): Promise<void | false> {
		const contentDoc = await getContent(this.firestore, id);
		if (contentDoc == null) {
			window.alert("コンテンツが見つかりませんでした。");
			return false;
		}
		pushQueryState({ id });
		let currentContent = contentDoc;

		const thumbnailContent = qsStrict<HTMLElement>("#thumbnailContent");
		const img = qsStrict<HTMLImageElement>("img", thumbnailContent);
		const titleInput = qsStrict<HTMLInputElement>("[name=title]", form);
		const descriptionInput = qsStrict<HTMLTextAreaElement>("[name=description]", form);
		let thumbInput = resetBtn(qsStrict<HTMLInputElement>("#content-thumb", thumbnailContent));
		let previewUrl: string | null = null;
		let isEditMode = false;

		const setFormValues = (content: ContentRecord) => {
			setFormValuesByPropsWithTimeConvert(form, this.toDetailFormContent(content), [
				"id",
				"title",
				"description",
				"state",
				"warnings",
				"createdAt",
				"updatedAt",
			]);
		};
		const revokePreviewUrl = () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				previewUrl = null;
			}
		};
		const setThumbnail = (url?: string, forceVisible = false) => {
			if (url) {
				img.src = url;
				thumbnailContent.classList.remove("d-none");
				return;
			}
			img.src = "";
			if (forceVisible) {
				thumbnailContent.classList.remove("d-none");
			} else {
				thumbnailContent.classList.add("d-none");
			}
		};
		const updatePreview = () => {
			const file = thumbInput.files?.[0] ?? null;
			revokePreviewUrl();
			if (!file) {
				setThumbnail(currentContent.thumbnailUrl, isEditMode);
				return;
			}
			previewUrl = URL.createObjectURL(file);
			img.src = previewUrl;
			thumbnailContent.classList.remove("d-none");
		};
		const buildStorageUrl = (filePath: string) => {
			const bucket = this.storage.app.options.storageBucket;
			if (!bucket) {
				throw new Error("storageBucketが設定されていません");
			}
			return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
		};
		const resolveImageMimeType = (file: File): string => {
			if (file.type) {
				return file.type;
			}
			const match = /\.([a-zA-Z0-9]+)$/.exec(file.name);
			if (!match) {
				throw new Error("選択されたファイルの形式を判別できません。別の画像ファイルを選択してください。");
			}
			const ext = match[1].toLowerCase();
			const extToMime: Record<string, string> = {
				png: "image/png",
				jpg: "image/jpeg",
				jpeg: "image/jpeg",
				webp: "image/webp",
				gif: "image/gif",
			};
			const mimeType = extToMime[ext];
			if (!mimeType) {
				throw new Error("対応していない画像形式です。PNG / JPEG / WebP 形式の画像を選択してください。");
			}
			return mimeType;
		};
		const uploadThumbnail = async (file: File, contentId: string) => {
			if (!contentId) {
				throw new Error("コンテンツIDが不正です");
			}
			const mimeType = resolveImageMimeType(file);
			if (isDebugMode()) {
				const currentUser = getAuth().currentUser;
				if (!currentUser) {
					throw new Error("ログインが必要です");
				}
				const ownerId = currentContent.ownerId;
				if (!ownerId) {
					throw new Error("コンテンツの所有者情報が不正です");
				}
				if (/[\\/]/.test(file.name)) {
					throw new Error("ファイル名に使用できない文字が含まれています");
				}
				const objectName = `${Date.now()}-${file.name}`;
				const objectPath = `uploads/${ownerId}/contents/thumbnail/${contentId}/${objectName}`;
				const storageRef = ref(this.storage, objectPath);
				await uploadBytes(storageRef, file, {
					contentType: mimeType,
					cacheControl: CACHE_CONTROL,
				});
				return getDownloadURL(storageRef);
			}
			const uploadInfo = await createContentUploadUrl(this.api, {
				kind: "thumbnail",
				mimeType,
				contentId,
			});
			const uploadResponse = await fetch(uploadInfo.data.url, {
				method: "PUT",
				headers: {
					"Content-Type": mimeType,
					"Cache-Control": CACHE_CONTROL,
					"x-goog-content-length-range": `0,${MAX_THUMB_SIZE}`,
				},
				body: file,
			});
			if (uploadResponse.ok === false) {
				throw new Error(`ファイルのアップロードに失敗しました: ${uploadResponse.statusText}`);
			}
			return buildStorageUrl(uploadInfo.data.filePath);
		};

		setFormValues(currentContent);
		setThumbnail(currentContent.thumbnailUrl);
		thumbInput.addEventListener("change", updatePreview);

		const feedbacksTableList = qsStrict<HTMLTableElement>("#feedbacksTableList");
		const feedbacksTbody = qsStrict<HTMLTableSectionElement>("tbody", feedbacksTableList);
		feedbacksTbody.innerHTML = "";
		const feedbacksDoc = await listFeedbacksByContentId(this.firestore, currentContent.ownerId, id, 50);
		feedbacksDoc.docs.forEach((doc) => {
			const feedbackData = { id: doc.id, ...doc.data() } as FeedbackRecord;
			const tr = convertContentFeedbackToHtmlRow(feedbackData);
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

		const setViewMode = () => {
			editBtn.classList.remove("btn-primary");
			editBtn.classList.add("btn-secondary");
			editBtn.textContent = "編集";
			cancelBtn.style.display = "none";
			isEditMode = false;
			deleteBtn.disabled = false;
			titleInput.readOnly = true;
			descriptionInput.readOnly = true;
			thumbInput.classList.add("d-none");
			thumbInput.value = "";
			revokePreviewUrl();
			setThumbnail(currentContent.thumbnailUrl);
		};

		const setEditMode = () => {
			editBtn.classList.remove("btn-secondary");
			editBtn.classList.add("btn-primary");
			editBtn.textContent = "更新";
			cancelBtn.style.display = "";
			isEditMode = true;
			deleteBtn.disabled = true;
			titleInput.readOnly = false;
			descriptionInput.readOnly = false;
			thumbInput.classList.remove("d-none");
			setThumbnail(currentContent.thumbnailUrl, true);
		};

		setViewMode();

		editBtn.addEventListener("click", async () => {
			if (editBtn.textContent === "編集") {
				setEditMode();
				return;
			}

			const title = titleInput.value.trim();
			if (!title) {
				window.alert("タイトルを入力してください。");
				titleInput.focus();
				return;
			}
			const thumbFile = thumbInput.files?.[0];
			if (thumbFile) {
				if (!this.isImageFile(thumbFile)) {
					window.alert("サムネイル画像はPNG/JPEG/WEBPのみ対応しています。");
					return;
				}
				if (thumbFile.size > MAX_THUMB_SIZE) {
					window.alert("サムネイル画像のサイズが大きすぎます。");
					return;
				}
			}

			try {
				editBtn.disabled = true;
				const description = descriptionInput.value.trim();
				const thumbnailUrl = thumbFile ? await uploadThumbnail(thumbFile, id) : currentContent.thumbnailUrl;
				const payload = {
					title,
					description,
					thumbnailUrl: thumbnailUrl ?? undefined,
				};
				await updateContent(this.api, id, payload);
				currentContent = {
					...currentContent,
					title,
					description,
					thumbnailUrl,
				};
				setFormValues(currentContent);
				await this.refresh();
				setViewMode();
			} catch (error) {
				console.error("更新に失敗しました:", error);
				window.alert("更新に失敗しました。時間をおいて再度お試しください。");
			} finally {
				editBtn.disabled = false;
			}
		});

		deleteBtn.addEventListener("click", async () => {
			const confirmed1 = window.confirm(`${currentContent.title} (${id}) を削除します。よろしいですか？`);
			if (!confirmed1) return;

			const confirmed2 = window.confirm("削除操作は元に戻せません。本当に実行してよろしいですか？");
			if (!confirmed2) return;

			try {
				deleteBtn.disabled = true;
				await deleteContent(this.api, id);
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
			setFormValues(currentContent);
			setViewMode();
		});
	}

	toDetailFormContent(content: ContentRecord): Omit<ContentRecord, "warnings"> & { warnings?: string } {
		return {
			...content,
			warnings: content.warnings?.join(", "),
		};
	}

	isImageFile(file: File) {
		const name = file.name.toLowerCase();
		const hasImageExt = [".png", ".jpg", ".jpeg", ".webp"].some((ext) => name.endsWith(ext));
		if (!file.type) {
			return hasImageExt;
		}
		return IMAGE_MIME_TYPES.includes(file.type) || hasImageExt;
	}

	onCloseModal(): void {
		pushQueryState({ id: undefined });
	}
}
