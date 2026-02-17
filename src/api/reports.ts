import type { Client } from "./client";

export interface CreateReportInput {
	contentId: string;
	category: string;
	description?: string;
}

export async function createReport(client: Client, input: CreateReportInput) {
	return client.callWithAuthorization<{ result: string; reportId: string }>(
		"POST",
		"/reports",
		JSON.stringify(input),
	);
}
