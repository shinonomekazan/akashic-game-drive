import { ContentRecord, UserProfile } from "../types";
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
	return firestore.runTransaction(async (transaction) => {
		const userDoc = firestore.collection("contents").doc();
		const doc = await transaction.get(userDoc);
		if (doc.exists) {
			// Update existing content
			transaction.update(
				userDoc,
				eraseUndefined({
					ownerId: content.ownerId,
					title: content.title,
					description: content.description,
					zipUrl: content.zipUrl,
					thumbnailUrl: content.thumbnailUrl,
					updatedAt: Timestamp.now(),
				}),
			);
		} else {
			// Create new content
			transaction.set(
				userDoc,
				eraseUndefined({
					ownerId: content.ownerId,
					title: content.title,
					description: content.description,
					zipUrl: content.zipUrl,
					thumbnailUrl: content.thumbnailUrl,
					createdAt: Timestamp.now(),
					updatedAt: Timestamp.now(),
				}),
			);
		}
	});
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
