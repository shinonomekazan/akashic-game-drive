import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { handleStorageZipFinalize } from "../zipValidation";
import { ContentRecord, FeedbackRecord } from "../types";
import { getFirebaseApp } from "../firebase";
import { Firestore, getFirestore, Query } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { eraseUndefined } from "../utils";

const DELETE_BATCH_SIZE = 200;

async function deleteQueryDocuments(query: Query, batchSize: number = DELETE_BATCH_SIZE) {
	while (true) {
		const snapshot = await query.limit(batchSize).get();
		if (snapshot.empty) {
			return;
		}

		const batch = query.firestore.batch();
		snapshot.docs.forEach((doc) => {
			batch.delete(doc.ref);
		});
		await batch.commit();

		if (snapshot.size < batchSize) {
			return;
		}
	}
}

async function deleteOwnerFeedbackAndLinkedMyFeedbacks(
	firestore: Firestore,
	ownerId: string,
	contentId: string,
	batchSize: number = DELETE_BATCH_SIZE,
) {
	while (true) {
		const snapshot = await firestore
			.collection("users")
			.doc(ownerId)
			.collection("feedbacks")
			.where("contentId", "==", contentId)
			.limit(batchSize)
			.get();

		if (snapshot.empty) {
			return;
		}

		const batch = firestore.batch();
		snapshot.docs.forEach((doc) => {
			const data = doc.data() as Omit<FeedbackRecord, "id">;
			batch.delete(doc.ref);

			if (data.senderId) {
				batch.delete(firestore.collection("users").doc(data.senderId).collection("myFeedbacks").doc(doc.id));
			}
		});
		await batch.commit();

		if (snapshot.size < batchSize) {
			return;
		}
	}
}

export const onZipUploaded = onObjectFinalized(
	{ region: "asia-northeast1", timeoutSeconds: 300 },
	handleStorageZipFinalize,
);

export const onMyFeedbackCreated = onDocumentCreated(
	{ region: "asia-northeast1", document: "users/{senderId}/myFeedbacks/{feedbackId}" },
	async (event) => {
		const snapshot = event.data;
		if (!snapshot) return;

		const data = snapshot.data() as Omit<FeedbackRecord, "id">;

		const receiverId = data.receiverId;
		const senderId = event.params.senderId;
		if (!receiverId || !senderId) return;

		const firebaseApp = await getFirebaseApp();
		const firestore = getFirestore(firebaseApp);

		await firestore
			.collection("users")
			.doc(receiverId)
			.collection("feedbacks")
			.doc(snapshot.id)
			.set(
				eraseUndefined({
					receiverId,
					senderId,
					title: data.title,
					detail: data.detail,
					contentId: data.contentId,
					createdAt: data.createdAt,
				}),
			);
	},
);

export const onContentDeleted = onDocumentDeleted(
	{ region: "asia-northeast1", document: "contents/{contentId}" },
	async (event) => {
		const snapshot = event.data;
		if (!snapshot) return;

		const contentId = event.params.contentId;
		const content = snapshot.data() as Omit<ContentRecord, "id">;
		const ownerId = content.ownerId;
		if (!contentId || !ownerId) return;

		const firebaseApp = await getFirebaseApp();
		const firestore = getFirestore(firebaseApp);
		const storage = getStorage(firebaseApp);

		const userRef = firestore.collection("users").doc(ownerId);
		await deleteOwnerFeedbackAndLinkedMyFeedbacks(firestore, ownerId, contentId);
		await deleteQueryDocuments(userRef.collection("myFeedbacks").where("contentId", "==", contentId));

		const bucket = storage.bucket();
		await Promise.all([
			bucket.deleteFiles({
				prefix: `uploads/${ownerId}/contents/thumbnail/${contentId}/`,
				force: true,
			}),
			bucket.deleteFiles({
				prefix: `uploads/${ownerId}/contents/zip/${contentId}/`,
				force: true,
			}),
		]);
	},
);
