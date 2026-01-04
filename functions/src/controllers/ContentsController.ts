import { App } from "../App";
import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import { getStorage } from "firebase-admin/storage";
import type { ContentRecord } from "../types";
import { storeContent, updateContent } from "../stores";
import * as resolvers from "../resolvers";

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
	contentId?: string;
}

interface ListMineParams {
	authorization: string;
}

interface UpdateParams {
	authorization: string;
	id: string;
	title: string;
	description?: string;
	zipUrl?: string;
	thumbnailUrl?: string;
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
		this.validators.put = [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.param("id").isString().notEmpty(),
					validators.body("title").isString().notEmpty(),
					validators.body("description").optional().isString(),
					validators.body("zipUrl").optional().isString().notEmpty(),
					validators.body("thumbnailUrl").optional().isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id,
						title: context.req.body.title,
						description: context.req.body.description,
						zipUrl: context.req.body.zipUrl,
						thumbnailUrl: context.req.body.thumbnailUrl,
					}) as UpdateParams,
			),
		];
	}

	register(basePath: string): Router {
		const router = super.register(basePath);
		this.registerRoute(router, "GET", "/me", this.listContents, [
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
					validators.body("contentId").optional().isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						kind: context.req.body.kind,
						mimeType: context.req.body.mimeType,
						fileName: context.req.body.fileName,
						contentId: context.req.body.contentId,
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

	async listContents(context: Context) {
		const p = context.params as ListMineParams;
		const verifyResult = await this.verify(p.authorization);
		return resolvers.contents.listContents(this.app.firestore, verifyResult.uid);
	}

	async put(context: Context) {
		const p = context.params as UpdateParams;
		const verifyResult = await this.verify(p.authorization);
		const result = await resolvers.contents.resolve(this.app.firestore, p.id, verifyResult.uid);
		if (result === null) {
			throw new fw.types.NotFound("コンテンツが見つかりません");
		}
		await updateContent(
			this.app.firestore,
			{
				id: p.id,
				title: p.title,
				description: p.description,
				zipUrl: p.zipUrl,
				thumbnailUrl: p.thumbnailUrl,
			},
			verifyResult.uid,
		);
		return {
			result: "ok",
		};
	}

	async createUploadUrl(context: Context) {
		const p = context.params as CreateUploadUrlParams;
		const verifyResult = await this.verify(p.authorization);
		const contentId = p.contentId?.trim();
		if (contentId) {
			const result = await resolvers.contents.resolve(this.app.firestore, contentId, verifyResult.uid);
			if (result === null) {
				throw new fw.types.NotFound("コンテンツが見つかりません");
			}
		} else {
			await this.ensureContentLimit(verifyResult.uid);
		}
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
