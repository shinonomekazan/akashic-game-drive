import type { Client } from "./client";

export interface CreateReportInput {
	contentId: string;
	category: "spam" | "violation" | "other";
	description?: string;
}

export async function createReport(client: Client, input: CreateReportInput) {
	return client.callWithAuthorization<{ reportId: string }>("POST", "/reports", JSON.stringify(input));
}
