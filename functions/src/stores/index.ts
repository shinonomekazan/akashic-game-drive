import { ContentRecord, FeedbackRecord, UserProfile, ReportRecord } from "../types";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import { eraseUndefined } from "../utils";
import * as fw from "../fw";

export function storeUser(firestore: Firestore, user: Omit<UserProfile, "createdAt" | "updatedAt">) {
	return firestore.runTransaction(async (transaction) => {
		const userDoc = firestore.collection("users").doc(user.uid);
		const doc = await transaction.get(userDoc);
		if (doc.exists) {
			// Update existing user
			transaction.update(
				userDoc,
				eraseUndefined({
					name: user.name,
					photoURL: user.photoURL,
					updatedAt: Timestamp.now(),
				}),
			);
		} else {
			// Create new user
			transaction.set(
				userDoc,
				eraseUndefined({
					name: user.name,
					photoURL: user.photoURL,
					createdAt: Timestamp.now(),
					updatedAt: Timestamp.now(),
				}),
			);
		}
	});
}

export function storeContent(
	firestore: Firestore,
	content: Pick<ContentRecord, "ownerId" | "title" | "description" | "zipUrl" | "thumbnailUrl">,
) {
	const contentDoc = firestore.collection("contents").doc();
	return contentDoc
		.set(
			eraseUndefined({
				ownerId: content.ownerId,
				title: content.title,
				description: content.description,
				zipUrl: content.zipUrl,
				thumbnailUrl: content.thumbnailUrl,
				createdAt: Timestamp.now(),
				updatedAt: Timestamp.now(),
			}),
		)
		.then(() => contentDoc.id);
}

export function updateContent(
	firestore: Firestore,
	content: Omit<ContentRecord, "createdAt" | "updatedAt" | "ownerId">,
	ownerId: string,
) {
	return firestore.runTransaction(async (transaction) => {
		const contentDoc = firestore.collection("contents").doc(content.id);
		const snapshot = await transaction.get(contentDoc);
		if (!snapshot.exists) {
			throw new fw.types.NotFound(`Content with id ${content.id} not found`);
		}
		const result = snapshot.data() as Omit<ContentRecord, "id">;
		if (result.ownerId !== ownerId) {
			throw new fw.types.Forbidden("不正なリクエストです");
		}
		transaction.update(
			contentDoc,
			eraseUndefined({
				title: content.title,
				description: content.description,
				zipUrl: content.zipUrl,
				thumbnailUrl: content.thumbnailUrl,
				updatedAt: Timestamp.now(),
			}),
		);
	});
}

export function updateUser(firestore: Firestore, user: Omit<UserProfile, "createdAt" | "updatedAt">) {
	return firestore.runTransaction(async (transaction) => {
		const userDoc = firestore.collection("users").doc(user.uid);
		const snapshot = await transaction.get(userDoc);
		if (!snapshot.exists) {
			throw new fw.types.NotFound(`User with id ${user.uid} not found`);
		}
		transaction.update(
			userDoc,
			eraseUndefined({
				name: user.name,
				photoURL: user.photoURL,
				updatedAt: Timestamp.now(),
			}),
		);
	});
}

export function storeFeedback(firestore: Firestore, feedback: Omit<FeedbackRecord, "id" | "createdAt">) {
	const feedbackDoc = firestore.collection("users").doc(feedback.senderId).collection("myFeedbacks").doc();
	return feedbackDoc.set(
		eraseUndefined({
			receiverId: feedback.receiverId,
			senderId: feedback.senderId,
			title: feedback.title,
			detail: feedback.detail,
			contentId: feedback.contentId,
			createdAt: Timestamp.now(),
		}),
	);
}

export function storeReport(
	firestore: Firestore,
	report: Pick<ReportRecord, "reporterId" | "contentId" | "category" | "description">,
) {
	const reportDoc = firestore.collection("reports").doc();
	return reportDoc
		.set(
			eraseUndefined({
				type: "content",
				reporterId: report.reporterId,
				contentId: report.contentId,
				category: report.category,
				description: report.description,
				status: "waiting",
				createdAt: Timestamp.now(),
			}),
		)
		.then(() => reportDoc.id);
}
