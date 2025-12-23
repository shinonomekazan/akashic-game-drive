import type { Timestamp } from "firebase/firestore";

export interface UserProfile {
	uid: string;
	displayName: string;
	photoURL?: string | null;
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}

export interface ContentRecord {
	id: string;
	ownerId: string;
	title: string;
	description?: string;
	zipUrl?: string;
	thumbnailUrl?: string;
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}
