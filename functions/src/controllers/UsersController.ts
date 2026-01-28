import { App } from "../App";
import { Timestamp } from "@google-cloud/firestore";
import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import * as resolvers from "../resolvers";
import { storeUser, updateUser } from "../stores";

interface RegisterParams {
	name: string;
	authorization: string;
}

interface UpdateParams {
	authorization: string;
	id: "me" | string;
	name: string;
}

interface GetParams {
	id: string;
}

interface ListContentsParams {
	id: string;
}

interface CreateFeedbackParams {
	authorization: string;
	id: string;
	title: string;
	detail: string;
}

export class UsersController extends BaseController {
	constructor(app: App) {
		super(app);
		this.validators.post = [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.body("name").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						name: context.req.body.name,
					}) as RegisterParams,
			),
		];

		this.validators.put = [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.param("id").isString().notEmpty(),
					validators.body("name").isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as "me" | string,
						name: context.req.body.name,
					}) as UpdateParams,
			),
		];
	}

	register(basePath: string): Router {
		const router = super.register(basePath);
		this.registerRoute(router, "GET", "/:id/contents", this.listUserContents, [new fw.params.StringIdValidator()]);
		this.registerRoute(router, "POST", "/:id/feedbacks", this.createFeedback, [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.param("id").isString().notEmpty(),
					validators.body("title").isString().notEmpty(),
					validators.body("detail").isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id,
						title: context.req.body.title,
						detail: context.req.body.detail,
					}) as CreateFeedbackParams,
			),
		]);
		return router;
	}

	async get(context: Context) {
		const p = context.params as GetParams;
		return {
			user: await resolvers.users.resolve(this.app.firestore, p.id),
		};
	}

	async post(context: Context) {
		const p = context.params as RegisterParams;
		const verifyResult = await this.verify(p.authorization);
		await storeUser(this.app.firestore, {
			uid: verifyResult.uid,
			name: p.name,
		});
		return {
			user: await resolvers.users.resolve(this.app.firestore, verifyResult.uid),
		};
	}

	async put(context: Context) {
		const p = context.params as UpdateParams;
		if (p.id !== "me") {
			throw new fw.types.BadRequest("不正なリクエストです");
		}
		const verifyResult = await this.verify(p.authorization);
		const result = await resolvers.users.resolve(this.app.firestore, verifyResult.uid);
		if (result === null) {
			throw new fw.types.NotFound("ユーザーが見つかりません");
		}
		await updateUser(this.app.firestore, {
			uid: verifyResult.uid,
			name: p.name,
		});
		return {
			result: "ok",
		};
	}

	async listUserContents(context: Context) {
		const p = context.params as ListContentsParams;
		return resolvers.contents.listContents(this.app.firestore, p.id);
	}

	async createFeedback(context: Context) {
		const p = context.params as CreateFeedbackParams;
		const verifyResult = await this.verify(p.authorization);
		if (p.id === verifyResult.uid) {
			throw new fw.types.BadRequest("不正なリクエストです");
		}

		const feedbackDoc = this.app.firestore
			.collection("users")
			.doc(verifyResult.uid)
			.collection("myFeedbacks")
			.doc();

		await feedbackDoc.set({
			receiverId: p.id,
			senderId: verifyResult.uid,
			title: p.title,
			detail: p.detail,
			createdAt: Timestamp.now(),
		});

		return {
			feedbackId: feedbackDoc.id,
		};
	}
}
