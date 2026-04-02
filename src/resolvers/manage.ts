import { ManageUser } from "../types";
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
	type Firestore,
} from "firebase/firestore";

export async function resolvers(firestore: Firestore, uid: string): Promise<ManageUser | null> {
	const manageUserDoc = await getDoc(doc(firestore, "manageUsers", uid));
	if (!manageUserDoc.exists()) {
		return null;
	}
	const data = manageUserDoc.data() as Omit<ManageUser, "id">;
	return {
		id: manageUserDoc.id,
		...data,
	};
}

export async function listManageUsers(firestore: Firestore, limitCount: number, lastDoc?: DocumentSnapshot) {
	const collectionRef = collection(firestore, "manageUsers");
	const constraints: QueryConstraint[] = [orderBy("createdAt", "asc")];
	if (lastDoc) constraints.push(startAfter(lastDoc));
	constraints.push(limit(limitCount));
	return getDocs(query(collectionRef, ...constraints));
}
