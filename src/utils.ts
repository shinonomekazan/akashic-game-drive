import { Route } from "./types";

export function qs<T extends HTMLElement>(selector: string, element: HTMLElement | Document = document): T | null {
	return element.querySelector<T>(selector);
}

export function qsStrict<T extends HTMLElement>(selector: string, element: HTMLElement | Document = document): T {
	const result = qs<T>(selector, element);
	if (result == null) throw new Error(`${selector}が見つかりません`);
	return result;
}

export function qsStrictAll<T extends Element>(parent: Element | Document, query: string) {
	const result = parent.querySelectorAll<T>(query);
	if (result == null) throw new Error(`${query}が見つかりません`);
	return result;
}

export function isXXXMode(param: string) {
	const params = new URLSearchParams(location.search);
	return params.has(param);
}

export function isDebugMode() {
	return isXXXMode("debug");
}

export function navigateTo(path: string) {
	const url = new URL(location.href);
	url.hash = "";
	url.pathname = path;
	if (isDebugMode()) {
		url.searchParams.set("debug", "true");
	}
	history.pushState({}, "", url.toString());
	window.dispatchEvent(new PopStateEvent("popstate"));
}

export function getFileNameFromUrl(url: string) {
	const fallbackName = "file.zip";
	try {
		const parsed = new URL(url);
		const path = parsed.pathname;
		const storageMatch = path.match(/\/o\/([^/]+)$/);
		if (storageMatch) {
			const decoded = decodeURIComponent(storageMatch[1]);
			const parts = decoded.split("/");
			return parts[parts.length - 1] || fallbackName;
		}
		const lastSegment = path.split("/").pop();
		return lastSegment ? decodeURIComponent(lastSegment) : fallbackName;
	} catch (err) {
		const raw = url.split("?")[0];
		const lastSegment = raw.split("/").pop();
		return lastSegment ? decodeURIComponent(lastSegment) : fallbackName;
	}
}

export function escapeHtml(value: string) {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#039;",
	};
	return value.replace(/[&<>"']/g, (m) => map[m]);
}

export function parseRoute(): Route {
	const path = window.location.pathname || "/";
	if (path === "/") {
		return { name: "top" };
	}
	if (path.startsWith("/login")) {
		return { name: "login" };
	}
	if (path.startsWith("/my/contents")) {
		return { name: "my-contents" };
	}
	if (path.startsWith("/my/edit")) {
		return { name: "my-edit" };
	}
	if (path.startsWith("/my")) {
		return { name: "my" };
	}
	return { name: "top" };
}

export function formatTimestamp(value: unknown) {
	const date = (() => {
		if (!value) return null;
		if (value instanceof Date) return value;
		if (typeof value === "number") return new Date(value);
		if (typeof (value as { toDate?: () => Date }).toDate === "function") {
			return (value as { toDate: () => Date }).toDate();
		}
		const seconds =
			(value as { seconds?: number; _seconds?: number }).seconds ?? (value as { _seconds?: number })._seconds;
		const nanoseconds =
			(value as { nanoseconds?: number; _nanoseconds?: number }).nanoseconds ??
			(value as { _nanoseconds?: number })._nanoseconds ??
			0;
		if (typeof seconds === "number") {
			return new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6));
		}
		return null;
	})();
	if (!date) return "-";
	const pad2 = (num: number) => num.toString().padStart(2, "0");
	const jstOffsetMs = 9 * 60 * 60 * 1000;
	const jstDate = new Date(date.getTime() + jstOffsetMs);
	return `${jstDate.getUTCFullYear()}/${pad2(jstDate.getUTCMonth() + 1)}/${pad2(
		jstDate.getUTCDate(),
	)} ${pad2(jstDate.getUTCHours())}:${pad2(jstDate.getUTCMinutes())}`;
}
