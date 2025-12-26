import type { AppConfig } from "./config.types";

const fallbackEnv = {
	FIREBASE_API_KEY: "AIzaSyC6ZUT58a66kchkuRAqrca6oPliykDSG7s",
	FIREBASE_AUTH_DOMAIN: "akashic-game-drive.firebaseapp.com",
	FIREBASE_PROJECT_ID: "akashic-game-drive",
	FIREBASE_STORAGE_BUCKET: "akashic-game-drive.firebasestorage.app",
	FIREBASE_MESSAGING_SENDER_ID: "74790524710",
	FIREBASE_APP_ID: "1:74790524710:web:8e19cae4759d77d56fd3e7",
	FIREBASE_MEASUREMENT_ID: "G-HHV36QKTGK",
};

function resolveEnv(key: keyof typeof fallbackEnv): string {
	const value = process.env[key] ?? fallbackEnv[key];
	if (!value || value === "undefined") {
		throw new Error(`${key} が設定されていません`);
	}
	return value;
}

export function configure(): AppConfig {
	return {
		firebaseConfig: {
			apiKey: resolveEnv("FIREBASE_API_KEY"),
			authDomain: resolveEnv("FIREBASE_AUTH_DOMAIN"),
			projectId: resolveEnv("FIREBASE_PROJECT_ID"),
			storageBucket: resolveEnv("FIREBASE_STORAGE_BUCKET"),
			messagingSenderId: resolveEnv("FIREBASE_MESSAGING_SENDER_ID"),
			appId: resolveEnv("FIREBASE_APP_ID"),
			measurementId: resolveEnv("FIREBASE_MEASUREMENT_ID"),
		},
	};
}

export const appConfig = configure();
