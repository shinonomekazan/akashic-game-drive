import { Router } from "express";
import BaseController from "./BaseController";
import * as fw from "../fw";
import * as params from "../params";
import * as validators from "express-validator";
import { Context } from "../Context";
import * as resolvers from "../resolvers";
import * as stores from "../stores";
import type { ReportRecord } from "../types";

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
}
