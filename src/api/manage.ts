import { Client } from "./client";
import type { CreateContentUploadUrlResult } from "./contents";

interface AuthenticateResult {
	role: string | null;
}

interface ManageUpdateContentInput {
	title: string;
	description?: string;
	thumbnailUrl?: string;
}

interface ManageCreateContentUploadUrlInput {
	kind: "thumbnail";
	mimeType: string;
	contentId: string;
}

export function authenticate(client: Client, id: string = "me") {
	return client.callWithAuthorization<AuthenticateResult>("POST", `/manage/${id}/authenticate`);
}

export function updateUser(client: Client, id: string, object: object) {
	return client.callWithAuthorization<{ result: string }>("PUT", `/manage/user/${id}`, JSON.stringify(object));
}

export function deleteUser(client: Client, id: string) {
	return client.callWithAuthorization<{ result: string }>("DELETE", `/manage/user/${id}`);
}

export function updateReport(client: Client, id: string, object: object) {
	return client.callWithAuthorization<{ result: string }>("PUT", `/manage/report/${id}`, JSON.stringify(object));
}

export function deleteReport(client: Client, id: string) {
	return client.callWithAuthorization<{ result: string }>("DELETE", `/manage/report/${id}`);
}

export function updateContent(client: Client, id: string, object: ManageUpdateContentInput) {
	return client.callWithAuthorization<{ result: string }>("PUT", `/manage/content/${id}`, JSON.stringify(object));
}

export function createContentUploadUrl(client: Client, input: ManageCreateContentUploadUrlInput) {
	return client.callWithAuthorization<CreateContentUploadUrlResult>(
		"POST",
		"/manage/content/upload-url",
		JSON.stringify(input),
	);
}

export function deleteContent(client: Client, id: string) {
	return client.callWithAuthorization<{ result: string }>("DELETE", `/manage/content/${id}`);
}

export function updateManageUser(client: Client, id: string, object: { name: string; role?: "administrator" | null }) {
	return client.callWithAuthorization<{ result: string }>("PUT", `/manage/manageUser/${id}`, JSON.stringify(object));
}

export function deleteManageUser(client: Client, id: string) {
	return client.callWithAuthorization<{ result: string }>("DELETE", `/manage/manageUser/${id}`);
}
