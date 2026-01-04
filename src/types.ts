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
	zipUrl?: string;
	thumbnailUrl?: string;
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}

export type Route =
	| { name: "top" }
	| { name: "login" }
	| { name: "my" }
	| { name: "my-edit" }
	| { name: "my-contents" }
	| { name: "content-edit"; contentId: string };

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
}
