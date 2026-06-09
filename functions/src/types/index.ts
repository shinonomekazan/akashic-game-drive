import { Timestamp } from "@google-cloud/firestore";

export interface UserProfile {
	uid: string;
	name: string;
	photoURL?: string | null;
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}

export interface ContentRecord {
	id: string;
	ownerId: string;
	title: string;
	description?: string;
	zipUrl?: string | null;
	thumbnailUrl?: string;
	extractedPath?: string | null;
	contentJsonPath?: string | null;
	state?: "ok" | "failed";
	warnings?: string[];
	trusted?: boolean;
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}

export interface FeedbackRecord {
	id: string;
	senderId: string;
	receiverId: string;
	title: string;
	detail: string;
	contentId?: string;
	createdAt: Timestamp;
}

export interface ReportRecord {
	id: string;
	type: "content";
	reporterId: string;
	contentId: string;
	category: "spam" | "violation" | "other";
	description?: string;
	status: "waiting" | "rejected" | "resolved";
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}

export interface ManageUser {
	id: string;
	name: string;
	note?: string | null;
	role?: "administrator";
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}
