import { doc, getDoc, type Firestore } from "firebase/firestore";
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
