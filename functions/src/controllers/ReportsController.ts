import { App } from "../App";
import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
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
					validators.body("contentId").isString().notEmpty().trim(),
					validators
						.body("category")
						.isString()
						.notEmpty()
						.trim()
						.isIn(["spam", "violation", "other"]),
					validators.body("description").optional().isString(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						contentId:
							typeof context.req.body.contentId === "string"
								? context.req.body.contentId.trim()
								: context.req.body.contentId,
						category:
							typeof context.req.body.category === "string"
								? context.req.body.category.trim()
								: context.req.body.category,
						description: context.req.body.description,
					}) as CreateParams,
			),
		];
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
