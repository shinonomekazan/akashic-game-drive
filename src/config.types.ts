export interface FirebaseConfig {
	apiKey: string;
	authDomain: string;
	projectId: string;
	storageBucket: string;
	messagingSenderId: string;
	appId: string;
	measurementId: string;
}

export interface ApiConfig {
	baseUrl: string;
	emulatorBaseUrl?: string;
	apiKey?: string;
}

export interface AppConfig {
	firebaseConfig: FirebaseConfig;
	apiConfig: ApiConfig;
}
