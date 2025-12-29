import { UserProfile } from "../types";
import type { Client } from "./Client";

export async function createUser(client: Client, name: string) {
	return client.callWithAuthorization<UserProfile>("POST", "/users", JSON.stringify({ name }));
}
