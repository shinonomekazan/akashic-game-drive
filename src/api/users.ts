import type { ApiConfig } from "../config.types";
import { callApi } from "./client";

interface CreateUserResponse {
	data?: unknown;
}

export async function createUser(apiConfig: ApiConfig, useEmulator: boolean, idToken: string, name: string) {
	return callApi<CreateUserResponse>(
		apiConfig,
		useEmulator,
		"POST",
		"/users",
		{
			name,
		},
		idToken,
	);
}
