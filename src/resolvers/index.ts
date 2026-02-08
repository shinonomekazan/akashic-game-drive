import { collection, doc, getDoc, getDocs, limit, orderBy, query, type Firestore } from "firebase/firestore";
import type { UserProfile } from "../types";

export async function getUser(firestore: Firestore, uid: string): Promise<UserProfile | null> {
	const snapshot = await getDoc(doc(firestore, "users", uid));
	if (!snapshot.exists()) {
		return null;
	}
	const data = snapshot.data() as Partial<UserProfile>;
	return {
		uid,
		name: data.name ?? "-",
		photoURL: data.photoURL ?? null,
		createdAt: data.createdAt ?? null,
		updatedAt: data.updatedAt ?? null,
	};
}

export async function listFeedback(firestore: Firestore, userId: string, limitCount?: number) {
	const collectionRef = collection(firestore, `users/${userId}/feedbacks`);
	const queryRef =
		limitCount !== undefined
			? query(collectionRef, orderBy("createdAt", "desc"), limit(limitCount))
			: query(collectionRef, orderBy("createdAt", "desc"));
	return getDocs(queryRef);
}

export async function listMyFeedbacks(firestore: Firestore, userId: string, limitCount?: number) {
	const collectionRef = collection(firestore, `users/${userId}/myFeedbacks`);
	const queryRef =
		limitCount !== undefined
			? query(collectionRef, orderBy("createdAt", "desc"), limit(limitCount))
			: query(collectionRef, orderBy("createdAt", "desc"));
	return getDocs(queryRef);
}
