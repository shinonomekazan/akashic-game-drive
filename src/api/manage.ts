import { Client } from "./client";

interface AuthenticateResult {
	role: string | null;
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
