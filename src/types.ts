import type { Timestamp } from "firebase/firestore";
import type { User } from "firebase/auth";

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

export type Route =
	| { name: "top" }
	| { name: "login" }
	| { name: "my" }
	| { name: "my-edit" }
	| { name: "my-contents" }
	| { name: "my-feedbacks" }
	| { name: "my-myFeedbacks" }
	| { name: "content-view"; contentId: string }
	| { name: "content-edit"; contentId: string }
	| { name: "user"; userId: string };

export interface AppState {
	route: Route;
	user: User | null;
	loading: boolean;
	profile: UserProfile | null;
	profileLoaded: boolean;
	profileLoading: boolean;
	needsProfile: boolean;
	contents: ContentRecord[];
	contentsLoaded: boolean;
	contentsLoading: boolean;
	userPageId: string | null;
	userPageProfile: UserProfile | null;
	userPageProfileLoaded: boolean;
	userPageProfileLoading: boolean;
	userPageContents: ContentRecord[];
	userPageContentsLoaded: boolean;
	userPageContentsLoading: boolean;
	contentViewId: string | null;
	contentView: ContentRecord | null;
	contentViewLoaded: boolean;
	contentViewLoading: boolean;
	contentViewOwnerId: string | null;
	contentViewOwner: UserProfile | null;
	contentViewOwnerLoaded: boolean;
	contentViewOwnerLoading: boolean;
	feedbacks: FeedbackRecord[];
	myFeedbacks: FeedbackRecord[];
	myFeedbacksLoaded: boolean;
	feedbacksLimit: number | null;
	myFeedbacksLimit: number | null;
	feedbackUsers: Record<string, UserProfile | null>;
	feedbackContentTitles: Record<string, string>;
	myFeedbackDisplayCount: number;
	mySentFeedbackDisplayCount: number;
	refreshMyFeedbacks: boolean;
}

export interface ManageUser {
	id: string;
	name: string;
	note?: string | null;
	role?: "administrator";
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}

export interface ReportRecord {
	id: string;
	type?: "content";
	reporterId: string;
	contentId: string;
	category: "spam" | "violation" | "other";
	description?: string;
	status: "waiting" | "rejected" | "resolved";
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}
