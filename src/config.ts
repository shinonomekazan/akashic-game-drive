import type { AppConfig } from "./config.types";

function requireEnv(key: string, value: string | undefined) {
	if (!value || value === "undefined") {
		throw new Error(`${key} が設定されていません`);
	}
	return value;
}

export function configure(): AppConfig {
	return {
		firebaseConfig: {
			apiKey: requireEnv("FIREBASE_API_KEY", process.env.FIREBASE_API_KEY),
			authDomain: requireEnv("FIREBASE_AUTH_DOMAIN", process.env.FIREBASE_AUTH_DOMAIN),
			projectId: requireEnv("FIREBASE_PROJECT_ID", process.env.FIREBASE_PROJECT_ID),
			storageBucket: requireEnv("FIREBASE_STORAGE_BUCKET", process.env.FIREBASE_STORAGE_BUCKET),
			messagingSenderId: requireEnv("FIREBASE_MESSAGING_SENDER_ID", process.env.FIREBASE_MESSAGING_SENDER_ID),
			appId: requireEnv("FIREBASE_APP_ID", process.env.FIREBASE_APP_ID),
			measurementId: process.env.FIREBASE_MEASUREMENT_ID ?? "",
		},
	};
}

export const appConfig = configure();
