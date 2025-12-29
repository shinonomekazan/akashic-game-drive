import { App } from "../App";
import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import * as resolvers from "../resolvers";
import { Timestamp } from "@google-cloud/firestore";
import { storeUser } from "../stores";

interface RegisterParams {
	name: string;
	authorization: string;
}

interface UpdateParams {
	authorization: string;
	id: "me" | string;
	name: string;
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
		return super.register(basePath);
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
		await this.app.firestore.collection("users").doc(verifyResult.uid).set(
			{
				name: p.name,
				updatedAt: Timestamp.now(),
			},
			{ merge: true },
		);
		return {
			result: "ok",
		};
	}
}
