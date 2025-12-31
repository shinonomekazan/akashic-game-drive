import { App } from "../App";
import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import { getStorage } from "firebase-admin/storage";
import type { ContentRecord } from "../types";
import { storeContent } from "../stores";

const ZIP_MIME_TYPES = ["application/zip", "application/x-zip-compressed"];
const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_ZIP_SIZE = 20 * 1024 * 1024;
const MAX_THUMB_SIZE = 20 * 1024 * 1024;
const MAX_CONTENTS_PER_USER = 10;
const CACHE_CONTROL = "public,max-age=604800,immutable";

interface CreateParams {
	authorization: string;
	title: string;
	description?: string;
	zipUrl: string;
	thumbnailUrl: string;
}

interface CreateUploadUrlParams {
	authorization: string;
	kind: "zip" | "thumbnail";
	mimeType: string;
	fileName?: string;
}

interface ListMineParams {
	authorization: string;
}

export class ContentsController extends BaseController {
	constructor(app: App) {
		super(app);
		this.validators.post = [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.body("title").isString().notEmpty(),
					validators.body("description").optional().isString(),
					validators.body("zipUrl").isString().notEmpty(),
					validators.body("thumbnailUrl").isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						title: context.req.body.title,
						description: context.req.body.description,
						zipUrl: context.req.body.zipUrl,
						thumbnailUrl: context.req.body.thumbnailUrl,
					}) as CreateParams,
			),
		];
	}

	register(basePath: string): Router {
		const router = super.register(basePath);
		this.registerRoute(router, "GET", "/me", this.listMine, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
					}) as ListMineParams,
			),
		]);
		this.registerRoute(router, "POST", "/upload-url", this.createUploadUrl, [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.body("kind").isString().isIn(["zip", "thumbnail"]),
					validators.body("mimeType").isString().notEmpty(),
					validators.body("fileName").optional().isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						kind: context.req.body.kind,
						mimeType: context.req.body.mimeType,
						fileName: context.req.body.fileName,
					}) as CreateUploadUrlParams,
			),
		]);
		return router;
	}

	async post(context: Context) {
		const p = context.params as CreateParams;
		const verifyResult = await this.verify(p.authorization);
		await this.ensureContentLimit(verifyResult.uid);
		const contentData = {
			ownerId: verifyResult.uid,
			title: p.title,
			description: p.description,
			zipUrl: p.zipUrl,
			thumbnailUrl: p.thumbnailUrl,
		} as Pick<ContentRecord, "ownerId" | "title" | "description" | "zipUrl" | "thumbnailUrl">;
		await storeContent(this.app.firestore, {
			...contentData,
		});
		return {
			result: "ok",
		};
	}

	async listMine(context: Context) {
		const p = context.params as ListMineParams;
		const verifyResult = await this.verify(p.authorization);
		const snapshot = await this.app.firestore
			.collection("contents")
			.where("ownerId", "==", verifyResult.uid)
			.get();
		const contents = snapshot.docs.map((doc) => {
			const data = doc.data() as Omit<ContentRecord, "id">;
			return {
				id: doc.id,
				...data,
			} as ContentRecord;
		});
		return {
			contents,
		};
	}

	async createUploadUrl(context: Context) {
		const p = context.params as CreateUploadUrlParams;
		const verifyResult = await this.verify(p.authorization);
		await this.ensureContentLimit(verifyResult.uid);
		const storage = getStorage(this.app.firebaseApp);
		const kind = p.kind;
		const mimeType = p.mimeType;
		if (kind === "zip" && !ZIP_MIME_TYPES.includes(mimeType)) {
			throw new fw.types.BadRequest("不正なファイル形式です");
		}
		if (kind === "thumbnail" && !IMAGE_MIME_TYPES.includes(mimeType)) {
			throw new fw.types.BadRequest("不正なファイル形式です");
		}
		const ext =
			kind === "zip" ? "zip" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
		const maxSize = kind === "zip" ? MAX_ZIP_SIZE : MAX_THUMB_SIZE;
		const fileName = p.fileName?.trim();
		if (kind === "zip") {
			if (!fileName) {
				throw new fw.types.BadRequest("ファイル名が不正です");
			}
			if (/[\\/]/.test(fileName)) {
				throw new fw.types.BadRequest("ファイル名に使用できない文字が含まれています");
			}
			if (!fileName.toLowerCase().endsWith(".zip")) {
				throw new fw.types.BadRequest("ZIPファイルのみ対応しています");
			}
		}
		const suffix = Math.random().toString(36).slice(2, 10);
		const objectName = kind === "zip" && fileName ? fileName : `${Date.now()}-${suffix}.${ext}`;
		const destination = `uploads/${verifyResult.uid}/contents/${kind}/${objectName}`;
		const [url] = await storage
			.bucket()
			.file(destination)
			.getSignedUrl({
				version: "v4",
				action: "write",
				expires: Date.now() + 60 * 60 * 1000,
				contentType: mimeType,
				extensionHeaders: {
					"Cache-Control": CACHE_CONTROL,
					"x-goog-content-length-range": `0,${maxSize}`,
				},
			});
		return {
			filePath: destination,
			url,
		};
	}

	private async ensureContentLimit(userId: string) {
		const snapshot = await this.app.firestore
			.collection("contents")
			.where("ownerId", "==", userId)
			.limit(MAX_CONTENTS_PER_USER)
			.get();
		if (snapshot.size >= MAX_CONTENTS_PER_USER) {
			throw new fw.types.Forbidden("投稿数の上限に達しました");
		}
	}
}
