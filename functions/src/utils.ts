import { Timestamp } from "@google-cloud/firestore";

export function eraseUndefined<T>(values: { [index: string]: any }) {
	Object.keys(values).forEach((key) => {
		if (values[key] === undefined) {
			delete values[key];
		}
	});
	return values as T;
}

export function sortContentsByCreatedAt<T extends { createdAt?: Timestamp | null }>(contents: T[]) {
	contents.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}
