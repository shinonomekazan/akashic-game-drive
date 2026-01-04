import { Firestore } from "@google-cloud/firestore";
import { ContentRecord } from "../types";
import * as fw from "../fw";

export async function listContents(firestore: Firestore, id: string) {
	const snapshot = await firestore.collection("contents").where("ownerId", "==", id).get();
	const contents = snapshot.docs.map((doc) => {
		const data = doc.data() as Omit<ContentRecord, "id">;
		return {
			id: doc.id,
			...data,
		} as ContentRecord;
	});
	return {
		contents,
	};
}

export async function resolve(firestore: Firestore, id: string, ownerId?: string): Promise<ContentRecord | null> {
	const contentDoc = await firestore.collection("contents").doc(id).get();
	if (contentDoc.exists !== true) return null;
	const data = contentDoc.data() as Omit<ContentRecord, "id">;
	if (ownerId) {
		if (data.ownerId !== ownerId) {
			throw new fw.types.Forbidden("不正なリクエストです");
		}
	}
	return {
		...contentDoc.data(),
		id: contentDoc.id,
	} as ContentRecord;
}
