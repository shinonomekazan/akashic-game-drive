import { ContentRecord, UserProfile } from "../types";
import type { Client } from "./client";

export async function createUser(client: Client, name: string) {
	return client.callWithAuthorization<{ user: UserProfile }>("POST", "/users", JSON.stringify({ name }));
}

export async function createFeedback(
	client: Client,
	receiverId: string,
	title: string,
	detail: string,
	contentId?: string,
) {
	return client.callWithAuthorization<{ result: "ok" }>(
		"POST",
		`/users/${encodeURIComponent(receiverId)}/feedbacks`,
		JSON.stringify({ title, detail, contentId }),
	);
}

export async function getUserById(client: Client, userId: string) {
	return client.call<{ user: UserProfile | null }>("GET", `/users/${encodeURIComponent(userId)}`);
}

export async function listUserContents(client: Client, userId: string) {
	return client.call<{ contents: ContentRecord[] }>("GET", `/users/${encodeURIComponent(userId)}/contents`);
}
