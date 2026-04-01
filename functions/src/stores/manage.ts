import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as fw from "../fw";
import type { ContentRecord, ManageUser, ReportRecord } from "../types";
import { eraseUndefined } from "../utils";
import { FieldValue } from "firebase-admin/firestore";

export function updateUser(firestore: Firestore, uid: string, name: string) {
	return firestore.runTransaction(async (transaction) => {
		const userDoc = firestore.collection("users").doc(uid);
		const snapshot = await transaction.get(userDoc);
		if (!snapshot.exists) {
			throw new fw.types.NotFound(`User with id ${uid} not found`);
		}
		transaction.update(userDoc, {
			name,
			updatedAt: Timestamp.now(),
		});
	});
}

export async function deleteUser(firestore: Firestore, uid: string) {
	const userDoc = firestore.collection("users").doc(uid);
	const snapshot = await userDoc.get();
	if (!snapshot.exists) {
		throw new fw.types.NotFound(`User with id ${uid} not found`);
	}

	const subcollections = await userDoc.listCollections();
	await Promise.all(
		subcollections.map(async (subcollection) => {
			const subDocs = await subcollection.listDocuments();
			await Promise.all(subDocs.map((doc) => doc.delete()));
		}),
	);

	await userDoc.delete();
}

export function updateReport(firestore: Firestore, id: string, status: ReportRecord["status"]) {
	return firestore.runTransaction(async (transaction) => {
		const reportDoc = firestore.collection("reports").doc(id);
		const snapshot = await transaction.get(reportDoc);
		if (!snapshot.exists) {
			throw new fw.types.NotFound(`Report with id ${id} not found`);
		}
		transaction.update(reportDoc, {
			status,
			updatedAt: Timestamp.now(),
		});
	});
}

export function updateContent(
	firestore: Firestore,
	content: Pick<ContentRecord, "id" | "title" | "description" | "thumbnailUrl">,
) {
	return firestore.runTransaction(async (transaction) => {
		const contentDoc = firestore.collection("contents").doc(content.id);
		const snapshot = await transaction.get(contentDoc);
		if (!snapshot.exists) {
			throw new fw.types.NotFound(`Content with id ${content.id} not found`);
		}
		transaction.update(
			contentDoc,
			eraseUndefined({
				title: content.title,
				description: content.description,
				thumbnailUrl: content.thumbnailUrl,
				updatedAt: Timestamp.now(),
			}),
		);
	});
}

export async function deleteContent(firestore: Firestore, id: string) {
	const contentDoc = firestore.collection("contents").doc(id);
	const snapshot = await contentDoc.get();
	if (!snapshot.exists) {
		throw new fw.types.NotFound(`Content with id ${id} not found`);
	}
	await contentDoc.delete();
}

export async function deleteReport(firestore: Firestore, id: string) {
	const reportDoc = firestore.collection("reports").doc(id);
	const snapshot = await reportDoc.get();
	if (!snapshot.exists) {
		throw new fw.types.NotFound(`Report with id ${id} not found`);
	}
	await reportDoc.delete();
}

export function updateManageUser(firestore: Firestore, manageUser: Pick<ManageUser, "id" | "name" | "role">) {
	return firestore.runTransaction(async (transaction) => {
		const manageUserDoc = firestore.collection("manageUsers").doc(manageUser.id);
		const snapshot = await transaction.get(manageUserDoc);
		if (!snapshot.exists) {
			throw new fw.types.NotFound(`ManageUser with id ${manageUser.id} not found`);
		}
		transaction.update(
			manageUserDoc,
			eraseUndefined({
				name: manageUser.name,
				role: manageUser.role ?? FieldValue.delete(),
				updatedAt: Timestamp.now(),
			}),
		);
	});
}

export async function deleteManageUser(firestore: Firestore, id: string) {
	const manageUserDoc = firestore.collection("manageUsers").doc(id);
	const snapshot = await manageUserDoc.get();
	if (!snapshot.exists) {
		throw new fw.types.NotFound(`ManageUser with id ${id} not found`);
	}
	await manageUserDoc.delete();
}
