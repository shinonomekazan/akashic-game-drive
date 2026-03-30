import { Router } from "express";
import BaseController from "./BaseController";
import * as fw from "../fw";
import * as params from "../params";
import * as validators from "express-validator";
import { Context } from "../Context";
import * as resolvers from "../resolvers";
import * as stores from "../stores";
import type { ReportRecord } from "../types";
import { getStorage } from "firebase-admin/storage";

const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_THUMB_SIZE = 20 * 1024 * 1024;
const CACHE_CONTROL = "public,max-age=604800,immutable";

interface AuthenticateManageUserParams {
	authorization: string;
	id: "me" | string;
}

interface UpdateUserParams {
	authorization: string;
	id: string;
	name: string;
}

interface DeleteUserParams {
	authorization: string;
	id: string;
}

interface UpdateReportParams {
	authorization: string;
	id: string;
	status: ReportRecord["status"];
}

interface DeleteReportParams {
	authorization: string;
	id: string;
}

interface UpdateContentParams {
	authorization: string;
	id: string;
	title: string;
	description?: string;
	thumbnailUrl?: string;
}

interface DeleteContentParams {
	authorization: string;
	id: string;
}

interface CreateContentUploadUrlParams {
	authorization: string;
	kind: "thumbnail";
	mimeType: string;
	contentId: string;
}

export class ManageController extends BaseController {
	register(basePath: string): Router {
		const router = super.register(basePath);
		this.registerRoute(router, "POST", "/:id/authenticate", this.authenticate, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidatorOptional(), validators.param("id").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as "me" | string,
					}) as AuthenticateManageUserParams,
			),
		]);

		this.registerRoute(router, "PUT", "/user/:id", this.updateUser, [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.param("id").isString().notEmpty(),
					validators.body("name").isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id,
						name: context.req.body.name,
					}) as UpdateUserParams,
			),
		]);

		this.registerRoute(router, "DELETE", "/user/:id", this.deleteUser, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.param("id").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id,
					}) as DeleteUserParams,
			),
		]);

		this.registerRoute(router, "PUT", "/report/:id", this.updateReport, [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.param("id").isString().notEmpty(),
					validators.body("status").isString().notEmpty().isIn(["waiting", "rejected", "resolved"]),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id,
						status: context.req.body.status,
					}) as UpdateReportParams,
			),
		]);

		this.registerRoute(router, "DELETE", "/report/:id", this.deleteReport, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.param("id").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id,
					}) as DeleteReportParams,
			),
		]);

		this.registerRoute(router, "PUT", "/content/:id", this.updateContent, [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.param("id").isString().notEmpty(),
					validators.body("title").isString().notEmpty(),
					validators.body("description").optional().isString(),
					validators.body("thumbnailUrl").optional().isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id,
						title: context.req.body.title,
						description: context.req.body.description,
						thumbnailUrl: context.req.body.thumbnailUrl,
					}) as UpdateContentParams,
			),
		]);

		this.registerRoute(router, "POST", "/content/upload-url", this.createContentUploadUrl, [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.body("kind").isString().isIn(["thumbnail"]),
					validators.body("mimeType").isString().notEmpty(),
					validators.body("contentId").isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						kind: context.req.body.kind,
						mimeType: context.req.body.mimeType,
						contentId: context.req.body.contentId,
					}) as CreateContentUploadUrlParams,
			),
		]);
		this.registerRoute(router, "DELETE", "/content/:id", this.deleteContent, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.param("id").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id,
					}) as DeleteContentParams,
			),
		]);

		return router;
	}

	async authenticate(context: Context) {
		const p = context.params as AuthenticateManageUserParams;
		if (p.authorization == null) {
			throw new fw.types.BadRequest("認証情報が必要です");
		}
		const verifyResult = await this.verify(p.authorization);
		const targetId = p.id === "me" ? verifyResult.uid : p.id;
		if (targetId !== verifyResult.uid) {
			throw new fw.types.Forbidden("必要な権限がありません。");
		}
		const manageUser = await resolvers.manageUsers.resolve(this.app.firestore, targetId);
		if (!manageUser) {
			throw new fw.types.Forbidden("必要な権限がありません。");
		}

		const desiredRoleClaim = manageUser.role === "administrator" ? "admin" : undefined;
		const userRecord = await this.app.auth.getUser(targetId);
		const currentClaims = userRecord.customClaims ?? {};
		if (currentClaims.role !== desiredRoleClaim) {
			const nextClaims: Record<string, any> = { ...currentClaims };
			if (desiredRoleClaim) {
				nextClaims.role = desiredRoleClaim;
			} else {
				delete nextClaims.role;
			}
			await this.app.auth.setCustomUserClaims(targetId, nextClaims);
		}

		return { role: desiredRoleClaim ?? null };
	}

	private async requireAdministrator(authorization: string) {
		const verifyResult = await this.verify(authorization);
		const manageUser = await resolvers.manageUsers.resolve(this.app.firestore, verifyResult.uid);
		if (!manageUser || manageUser.role !== "administrator") {
			throw new fw.types.Forbidden("必要な権限がありません。");
		}
		return manageUser;
	}

	async updateUser(context: Context) {
		const p = context.params as UpdateUserParams;
		await this.requireAdministrator(p.authorization);

		await stores.manage.updateUser(this.app.firestore, p.id, p.name);

		return { result: "ok" };
	}

	async deleteUser(context: Context) {
		const p = context.params as DeleteUserParams;
		await this.requireAdministrator(p.authorization);

		await stores.manage.deleteUser(this.app.firestore, p.id);
		await this.app.auth.deleteUser(p.id);

		return { result: "ok" };
	}

	async updateReport(context: Context) {
		const p = context.params as UpdateReportParams;
		await this.requireAdministrator(p.authorization);

		await stores.manage.updateReport(this.app.firestore, p.id, p.status);

		return { result: "ok" };
	}

	async deleteReport(context: Context) {
		const p = context.params as DeleteReportParams;
		await this.requireAdministrator(p.authorization);

		await stores.manage.deleteReport(this.app.firestore, p.id);

		return { result: "ok" };
	}

	async updateContent(context: Context) {
		const p = context.params as UpdateContentParams;
		await this.requireAdministrator(p.authorization);

		const content = await resolvers.contents.resolve(this.app.firestore, p.id);
		if (content === null) {
			throw new fw.types.NotFound("コンテンツが見つかりません");
		}

		await stores.manage.updateContent(this.app.firestore, {
			id: p.id,
			title: p.title,
			description: p.description,
			thumbnailUrl: p.thumbnailUrl,
		});

		return { result: "ok" };
	}

	async deleteContent(context: Context) {
		const p = context.params as DeleteContentParams;
		await this.requireAdministrator(p.authorization);

		const content = await resolvers.contents.resolve(this.app.firestore, p.id);
		if (content === null) {
			throw new fw.types.NotFound("コンテンツが見つかりません");
		}

		await stores.manage.deleteContent(this.app.firestore, p.id);

		return { result: "ok" };
	}

	async createContentUploadUrl(context: Context) {
		const p = context.params as CreateContentUploadUrlParams;
		await this.requireAdministrator(p.authorization);

		const contentId = p.contentId.trim();
		const content = await resolvers.contents.resolve(this.app.firestore, contentId);
		if (content === null) {
			throw new fw.types.NotFound("コンテンツが見つかりません");
		}

		const storage = getStorage(this.app.firebaseApp);
		const mimeType = p.mimeType;
		if (!IMAGE_MIME_TYPES.includes(mimeType)) {
			throw new fw.types.BadRequest("不正なファイル形式です");
		}

		const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";

		const suffix = Math.random().toString(36).slice(2, 10);
		const objectName = `${Date.now()}-${suffix}.${ext}`;
		const destination = `uploads/${content.ownerId}/contents/thumbnail/${contentId}/${objectName}`;
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
					"x-goog-content-length-range": `0,${MAX_THUMB_SIZE}`,
				},
			});

		return {
			filePath: destination,
			url,
		};
	}
}
