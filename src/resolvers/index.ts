import {
	collection,
	doc,
	DocumentSnapshot,
	getDoc,
	getDocs,
	limit,
	orderBy,
	query,
	QueryConstraint,
	startAfter,
	where,
	type Firestore,
} from "firebase/firestore";
import type { UserProfile } from "../types";
import * as manage from "./manage";

export { manage };

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

export async function listFeedbacks(firestore: Firestore, userId: string, limitCount?: number) {
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

export async function listUser(
	firestore: Firestore,
	limitCount: number,
	lastDoc?: DocumentSnapshot,
	filter?: { id?: string; username?: string },
) {
	const collectionRef = collection(firestore, "users");
	const constraints: QueryConstraint[] = [];

	if (filter?.id) {
		constraints.push(where("__name__", ">=", filter.id));
		constraints.push(where("__name__", "<=", filter.id + "\uf8ff"));
	} else if (filter?.username) {
		constraints.push(orderBy("name"));
		constraints.push(where("name", ">=", filter.username));
		constraints.push(where("name", "<=", filter.username + "\uf8ff"));
	} else {
		constraints.push(orderBy("createdAt", "desc"));
	}

	if (lastDoc) constraints.push(startAfter(lastDoc));
	constraints.push(limit(limitCount));

	return getDocs(query(collectionRef, ...constraints));
}

export async function listContent(firestore: Firestore, ownerId: string) {
	const collectionRef = collection(firestore, "contents");
	const queryRef = query(collectionRef, where("ownerId", "==", ownerId));
	return getDocs(queryRef);
}
