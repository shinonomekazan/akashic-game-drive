import {
	collection,
	doc,
	DocumentData,
	DocumentSnapshot,
	Firestore,
	getDoc,
	getDocs,
	limit,
	orderBy,
	query,
	QueryConstraint,
	QuerySnapshot,
	startAfter,
	where,
} from "firebase/firestore";
import { ContentRecord } from "../types";

export type ContentSearchCondition = "warning" | "noThumbnail";

export type ContentListFilter = {
	id?: string;
	userId?: string;
	userName?: string;
	title?: string;
	description?: string;
	status?: string;
	conditions?: ContentSearchCondition[];
};

const CONTENT_CONDITION_PREDICATES: Record<ContentSearchCondition, (data: DocumentData) => boolean> = {
	warning: (data) => Array.isArray(data.warnings) && data.warnings.length > 0,
	noThumbnail: (data) => {
		const thumbnailUrl = data.thumbnailUrl;
		return thumbnailUrl == null || `${thumbnailUrl}`.trim() === "";
	},
};

function normalizeContentConditions(conditions?: ContentListFilter["conditions"]): ContentSearchCondition[] {
	if (!conditions?.length) return [];
	return Array.from(new Set(conditions)).filter((condition): condition is ContentSearchCondition =>
		Object.prototype.hasOwnProperty.call(CONTENT_CONDITION_PREDICATES, condition),
	);
}

function withFilteredDocs(
	snapshot: QuerySnapshot<DocumentData>,
	docs: QuerySnapshot<DocumentData>["docs"],
): QuerySnapshot<DocumentData> {
	return {
		...snapshot,
		docs,
		size: docs.length,
		empty: docs.length === 0,
	} as unknown as QuerySnapshot<DocumentData>;
}

export async function listContents(
	firestore: Firestore,
	limitCount: number,
	lastDoc?: DocumentSnapshot,
	filter?: ContentListFilter,
) {
	const collectionRef = collection(firestore, "contents");
	const constraints: QueryConstraint[] = [];
	if (filter?.id) {
		constraints.push(where("__name__", "==", filter.id));
	} else {
		if (filter?.userId) {
			constraints.push(where("ownerId", "==", filter.userId));
		}
		if (filter?.userName) {
			const usersByNameQuery = query(collection(firestore, "users"), where("name", "==", filter.userName));
			const userSnapshot = await getDocs(usersByNameQuery);
			const ownerIds = userSnapshot.docs.map((doc) => doc.id);

			if (ownerIds.length === 0) {
				return {
					docs: [],
					empty: true,
					size: 0,
				} as unknown as QuerySnapshot<DocumentData>;
			} else if (ownerIds.length === 1) {
				constraints.push(where("ownerId", "==", ownerIds[0]));
			} else {
				if (ownerIds.length > 10) {
					throw new Error("ユーザー名に一致するユーザーが多すぎます。ユーザーIDで絞り込んでください。");
				}
				constraints.push(where("ownerId", "in", ownerIds));
			}
		}
		if (filter?.title) {
			constraints.push(orderBy("title", "asc"));
			constraints.push(where("title", ">=", filter.title));
			constraints.push(where("title", "<=", filter.title + "\uf8ff"));
		}
		if (filter?.description) {
			constraints.push(orderBy("description", "asc"));
			constraints.push(where("description", ">=", filter.description));
			constraints.push(where("description", "<=", filter.description + "\uf8ff"));
		}
		if (filter?.status) {
			constraints.push(where("state", "==", filter.status));
		}
	}

	if (lastDoc) constraints.push(startAfter(lastDoc));
	constraints.push(limit(limitCount));

	const snapshot = await getDocs(query(collectionRef, ...constraints));
	const conditions = normalizeContentConditions(filter?.conditions);
	if (conditions.length === 0) {
		return snapshot;
	}

	const filteredDocs = snapshot.docs.filter((doc) => {
		const data = doc.data();
		return conditions.every((condition) => CONTENT_CONDITION_PREDICATES[condition](data));
	});
	if (filteredDocs.length === snapshot.docs.length) {
		return snapshot;
	}
	return withFilteredDocs(snapshot, filteredDocs);
}

export async function getContent(firestore: Firestore, id: string): Promise<ContentRecord | null> {
	const snapshot = await getDoc(doc(firestore, "contents", id));
	if (!snapshot.exists()) {
		return null;
	}
	const data = snapshot.data() as ContentRecord;
	return {
		...data,
		id,
	};
}
