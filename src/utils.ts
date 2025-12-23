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

let searchParams: URLSearchParams | null = null;

export function isXXXMode(param: string) {
	if (searchParams == null) {
		searchParams = new URLSearchParams(location.search);
	}
	return searchParams.has(param);
}

export function isDebugMode() {
	return isXXXMode("debug");
}

export function navigateTo(path: string) {
	const url = new URL(location.href);
	url.hash = path;
	if (isDebugMode()) {
		url.searchParams.set("debug", "true");
	}
	location.href = url.toString();
}
