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
import type { ReportRecord } from "../types";

export async function getReport(firestore: Firestore, id: string): Promise<ReportRecord | null> {
	const snapshot = await getDoc(doc(firestore, "reports", id));
	if (!snapshot.exists()) {
		return null;
	}
	const data = snapshot.data() as ReportRecord;
	return {
		id,
		reporterId: data.reporterId ?? "",
		contentId: data.contentId ?? "",
		category: data.category ?? "other",
		description: data.description ?? "",
		status: data.status ?? "waiting",
		type: data.type,
		createdAt: data.createdAt,
		updatedAt: data.updatedAt,
	};
}

export async function listReport(
	firestore: Firestore,
	limitCount: number,
	lastDoc?: DocumentSnapshot,
	filter?: {
		id?: string;
		reporterId?: string;
		contentId?: string;
		categories?: string[];
		description?: string;
		statuses?: string[];
	},
) {
	const collectionRef = collection(firestore, "reports");
	const constraints: QueryConstraint[] = [];
	if (filter?.id) {
		constraints.push(where("__name__", "==", filter.id));
	} else if (filter?.reporterId) {
		constraints.push(where("reporterId", "==", filter.reporterId));
		constraints.push(orderBy("createdAt", "desc"));
	} else if (filter?.contentId) {
		constraints.push(where("contentId", "==", filter.contentId));
		constraints.push(orderBy("createdAt", "desc"));
	} else if (filter?.description) {
		constraints.push(orderBy("description"));
		constraints.push(where("description", ">=", filter.description));
		constraints.push(where("description", "<=", filter.description + "\uf8ff"));
		constraints.push(orderBy("createdAt", "desc"));
	} else if (filter?.categories && filter.categories.length > 0) {
		constraints.push(where("category", "in", filter.categories));
		constraints.push(orderBy("createdAt", "desc"));
	} else if (filter?.statuses && filter.statuses.length > 0) {
		constraints.push(where("status", "in", filter.statuses));
		constraints.push(orderBy("createdAt", "desc"));
	} else {
		constraints.push(orderBy("createdAt", "desc"));
	}

	if (lastDoc) constraints.push(startAfter(lastDoc));
	constraints.push(limit(limitCount));

	return getDocs(query(collectionRef, ...constraints));
}
