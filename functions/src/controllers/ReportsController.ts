import { App } from "../App";
import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import type { ReportRecord } from "../types";
import { storeReport } from "../stores";

interface CreateParams {
	authorization: string;
	contentId: string;
	category: string;
	description?: string;
}

export class ReportsController extends BaseController {
	constructor(app: App) {
		super(app);
		this.validators.post = [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.body("contentId").isString().notEmpty(),
					validators.body("category").isString().notEmpty(),
					validators.body("description").optional().isString(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						contentId: context.req.body.contentId,
						category: context.req.body.category,
						description: context.req.body.description,
					}) as CreateParams,
			),
		];
	}

	register(basePath: string): Router {
		const router = super.register(basePath);

		return router;
	}

	async post(context: Context) {
		const p = context.params as CreateParams;
		const verifyResult = await this.verify(p.authorization);
		const reportData = {
			reporterId: verifyResult.uid,
			contentId: p.contentId,
			category: p.category,
			description: p.description,
		} as Pick<ReportRecord, "reporterId" | "contentId" | "category" | "description">;
		const reportId = await storeReport(this.app.firestore, {
			...reportData,
		});
		return {
			reportId,
		};
	}
}
