import { UserProfile } from "../types";
import type { Client } from "./client";

interface ApiResponse<T> {
	data: T;
}

export async function createUser(client: Client, name: string) {
	return client.callWithAuthorization<UserProfile>("POST", "/users", JSON.stringify({ name }));
}

export async function fetchUserProfile(client: Client, userId: string) {
	return client.call<ApiResponse<{ user: UserProfile | null }>>("GET", `/users/${encodeURIComponent(userId)}`);
}
