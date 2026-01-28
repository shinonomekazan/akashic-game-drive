import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { handleStorageZipFinalize } from "../zipValidation";
import { FeedbackRecord } from "../types";
import { getFirebaseApp } from "../firebase";
import { getFirestore } from "firebase-admin/firestore";

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

		await firestore.collection("users").doc(receiverId).collection("feedbacks").doc(snapshot.id).set({
			receiverId,
			senderId,
			title: data.title,
			detail: data.detail,
			createdAt: data.createdAt,
		});
	},
);
