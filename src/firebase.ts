import { getAnalytics } from "firebase/analytics";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import type { FirebaseConfig } from "./config.types";

export interface FirebaseInstance {
	app: FirebaseApp;
	analytics: ReturnType<typeof getAnalytics> | null;
	auth: Auth;
	firestore: Firestore;
	storage: FirebaseStorage;
}

export function initializeFirebase(options: FirebaseConfig): FirebaseInstance {
	const app = initializeApp(options);
	const auth = getAuth(app);
	const firestore = getFirestore(app);
	const storage = getStorage(app);
	const analytics = tryGetAnalytics(app);

	return { app, auth, firestore, storage, analytics };
}

function tryGetAnalytics(app: FirebaseApp) {
	try {
		return getAnalytics(app);
	} catch {
		return null;
	}
}
