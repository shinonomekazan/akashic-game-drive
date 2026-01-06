import type { ContentRecord } from "../types";
import type { Client } from "./client";

export interface CreateContentInput {
	title: string;
	description?: string;
	zipUrl: string;
	thumbnailUrl: string;
}

export interface UpdateContentInput {
	title: string;
	description?: string;
	zipUrl?: string;
	thumbnailUrl?: string;
}

export interface CreateContentUploadUrlInput {
	kind: "zip" | "thumbnail";
	mimeType: string;
	fileName?: string;
	contentId?: string;
}

export interface CreateContentUploadUrlResult {
	filePath: string;
	url: string;
}

export async function createContent(client: Client, input: CreateContentInput) {
	return client.callWithAuthorization<{ result: string }>("POST", "/contents", JSON.stringify(input));
}

export async function updateContent(client: Client, contentId: string, input: UpdateContentInput) {
	return client.callWithAuthorization<{ result: string }>("PUT", `/contents/${contentId}`, JSON.stringify(input));
}

export async function listMyContents(client: Client) {
	return client.callWithAuthorization<{ contents: ContentRecord[] }>("GET", "/contents/me");
}

export async function listUserContents(client: Client, userId: string) {
	return client.call<{ contents: ContentRecord[] }>("GET", `/users/${encodeURIComponent(userId)}/contents`);
}

export async function createContentUploadUrl(client: Client, input: CreateContentUploadUrlInput) {
	return client.callWithAuthorization<CreateContentUploadUrlResult>(
		"POST",
		"/contents/upload-url",
		JSON.stringify(input),
	);
}
