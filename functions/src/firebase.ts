import { applicationDefault, getApps, initializeApp, type App as FirebaseApp } from "firebase-admin/app";
import * as path from "path";
import * as fw from "./fw";
import type { Config } from "./config";

let firebaseAppPromise: Promise<FirebaseApp> | null = null;

export async function getFirebaseApp(): Promise<FirebaseApp> {
	if (firebaseAppPromise) return firebaseAppPromise;
	firebaseAppPromise = fw.Configure<Config>(path.resolve(__dirname, "config")).then((config) => {
		const apps = getApps();
		if (apps.length > 0) {
			return apps[0];
		}
		return initializeApp({
			credential: applicationDefault(),
			storageBucket: config.app.storageBucket,
		});
	});
	return firebaseAppPromise;
}
