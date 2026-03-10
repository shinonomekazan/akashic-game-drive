import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as fw from "../fw";

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
