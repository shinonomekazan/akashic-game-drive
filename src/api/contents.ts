import type { ContentRecord } from "../types";
import type { Client } from "./client";

export interface CreateContentInput {
	title: string;
	description?: string;
	zipUrl: string;
	thumbnailUrl: string;
}

interface ApiResponse<T> {
	data: T;
}

export interface CreateContentUploadUrlInput {
	kind: "zip" | "thumbnail";
	mimeType: string;
}

export interface CreateContentUploadUrlResult {
	filePath: string;
	url: string;
}

export async function createContent(client: Client, input: CreateContentInput) {
	return client.callWithAuthorization<{ content: ContentRecord }>("POST", "/contents", JSON.stringify(input));
}

export async function listMyContents(client: Client) {
	return client.callWithAuthorization<ApiResponse<{ contents: ContentRecord[] }>>("GET", "/contents/me");
}

export async function createContentUploadUrl(client: Client, input: CreateContentUploadUrlInput) {
	return client.callWithAuthorization<ApiResponse<CreateContentUploadUrlResult>>(
		"POST",
		"/contents/upload-url",
		JSON.stringify(input),
	);
}
