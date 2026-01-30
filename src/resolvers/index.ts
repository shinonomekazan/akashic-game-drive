import { collection, doc, getDoc, getDocs, orderBy, query, type Firestore } from "firebase/firestore";
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

export async function listFeedback(firestore: Firestore, userId: string) {
	const collectionRef = collection(firestore, `users/${userId}/feedbacks`);
	const queryRef = query(collectionRef, orderBy("createdAt", "desc"));
	return getDocs(queryRef);
}
