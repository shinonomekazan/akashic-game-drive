import type { Client } from "./Client";

interface CreateUserResponse {
	data?: unknown;
}

export async function createUser(client: Client, name: string) {
	return client.callWithAuthorization<CreateUserResponse>("POST", "/users", JSON.stringify({ name }));
}
