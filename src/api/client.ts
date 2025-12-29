import type { ApiConfig } from "../config.types";

interface ApiErrorResponse {
	meta?: {
		status?: number;
		errorCode?: string;
		message?: string;
	};
	data?: unknown;
}

export function resolveApiBaseUrl(config: ApiConfig, useEmulator: boolean) {
	if (useEmulator && config.emulatorBaseUrl) {
		return config.emulatorBaseUrl;
	}
	return config.baseUrl;
}

export async function callApi<T>(
	config: ApiConfig,
	useEmulator: boolean,
	method: string,
	path: string,
	body?: unknown,
	idToken?: string,
): Promise<T> {
	const baseUrl = resolveApiBaseUrl(config, useEmulator);
	const headers: Record<string, string> = {
		"Content-Type": "application/json; charset=utf-8",
	};
	if (config.apiKey) {
		headers["X-API-KEY"] = config.apiKey;
	}
	if (idToken) {
		headers.Authorization = `Bearer ${idToken}`;
	}

	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers,
		body: body == null ? undefined : JSON.stringify(body),
	});

	if (response.ok) {
		return (await response.json()) as T;
	}

	let errorMessage = `API request failed: ${response.status}`;
	try {
		const errorJson = (await response.json()) as ApiErrorResponse;
		if (errorJson?.meta?.message) {
			errorMessage = errorJson.meta.message;
		}
	} catch {
	}
	throw new Error(errorMessage);
}
