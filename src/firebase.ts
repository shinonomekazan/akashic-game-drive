import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import type { FirebaseConfig } from "./config.types";

export interface FirebaseInstance {
	app: ReturnType<typeof initializeApp>;
	analytics: ReturnType<typeof getAnalytics>;
	auth: ReturnType<typeof getAuth>;
	firestore: ReturnType<typeof getFirestore>;
	storage: ReturnType<typeof getStorage>;
}

export function initializeFirebase(options: FirebaseConfig): FirebaseInstance {
	const app = initializeApp(options);
	const auth = getAuth(app);
	const firestore = getFirestore(app);
	const storage = getStorage(app);
	const analytics = getAnalytics(app);

	return { app, auth, firestore, storage, analytics };
}
