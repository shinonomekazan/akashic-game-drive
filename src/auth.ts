import {
	GoogleAuthProvider,
	onAuthStateChanged,
	signInWithPopup,
	signOut,
	type Unsubscribe,
	type User,
} from "firebase/auth";
import type { FirebaseInstance } from "./firebase";

const provider = new GoogleAuthProvider();

export function watchAuthChanges(firebase: FirebaseInstance, callback: (user: User | null) => void): Unsubscribe {
	return onAuthStateChanged(firebase.auth, callback);
}

export async function signInWithGoogle(firebase: FirebaseInstance): Promise<User> {
	const result = await signInWithPopup(firebase.auth, provider);
	if (!result.user) {
		throw new Error("ログインできません。");
	}
	return result.user;
}

export async function signOutCurrentUser(firebase: FirebaseInstance): Promise<void> {
	await signOut(firebase.auth);
}
