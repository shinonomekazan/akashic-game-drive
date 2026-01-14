import { getDownloadURL, ref, type FirebaseStorage } from "firebase/storage";
import type { ContentRecord } from "./types";
import * as utils from "./utils";

interface DownloadMessages {
	unavailable: string;
	gameJsonFailed: string;
	listFailed: string;
}

interface DownloadOptions {
	content: ContentRecord;
	storage: FirebaseStorage;
	container: HTMLElement;
	isDebugMode: boolean;
	messages: DownloadMessages;
}

interface DownloadLink {
	filePath: string;
	url: string;
}

async function forceDownload(url: string, filename: string) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error("DOWNLOAD_FAILED");
	}
	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = filename;
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
}

function normalizePath(value: string) {
	const trimmed = value
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\.\/+/, "")
		.replace(/^\/+/, "");
	if (!trimmed) return null;
	const segments = trimmed.split("/").filter(Boolean);
	if (segments.includes("..")) return null;
	return segments.join("/");
}

function collectDownloadPaths(gameJson: Record<string, unknown>) {
	const paths = new Set<string>();
	const addPath = (value: unknown) => {
		if (typeof value !== "string") return;
		const normalized = normalizePath(value);
		if (!normalized) return;
		paths.add(normalized);
	};

	const assets = gameJson.assets as Record<string, { path?: unknown }> | undefined;
	if (assets && typeof assets === "object") {
		Object.values(assets).forEach((asset) => addPath(asset?.path));
	}

	const moduleMainScripts = gameJson.moduleMainScripts as Record<string, unknown> | undefined;
	if (moduleMainScripts && typeof moduleMainScripts === "object") {
		Object.values(moduleMainScripts).forEach(addPath);
	}

	return [...paths].sort();
}

async function buildDownloadLinks(
	content: ContentRecord,
	storage: FirebaseStorage,
	isDebugMode: boolean,
): Promise<DownloadLink[]> {
	const extractedPath = content.extractedPath;
	const bucket = storage.app.options.storageBucket;
	if (!extractedPath || !bucket) {
		throw new Error("UNAVAILABLE");
	}
	const joinPath = (base: string, relative: string) => `${base.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;
	const buildPublicUrl = (objectPath: string) =>
		`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
	const resolveUrl = async (objectPath: string) => {
		if (isDebugMode) {
			return getDownloadURL(ref(storage, objectPath));
		}
		return buildPublicUrl(objectPath);
	};

	const gameJsonUrl = await resolveUrl(joinPath(extractedPath, "game.json"));
	const response = await fetch(gameJsonUrl);
	if (!response.ok) {
		throw new Error("GAME_JSON_FETCH_FAILED");
	}
	const gameJson = (await response.json()) as Record<string, unknown>;
	const filePaths = collectDownloadPaths(gameJson);
	if (!filePaths.includes("game.json")) {
		filePaths.unshift("game.json");
	}
	return Promise.all(
		filePaths.map(async (filePath) => {
			const url = await resolveUrl(joinPath(extractedPath, filePath));
			return { filePath, url };
		}),
	);
}

export async function loadContentFiles({
	content,
	storage,
	container,
	isDebugMode,
	messages,
}: DownloadOptions): Promise<void> {
	try {
		const links = await buildDownloadLinks(content, storage, isDebugMode);
		const handleDownload = async (event: Event) => {
			const target = event.target as HTMLElement | null;
			const linkEl = target?.closest<HTMLAnchorElement>("a[data-file]");
			if (!linkEl) return;
			event.preventDefault();
			const url = linkEl.dataset.url;
			const name = linkEl.dataset.file;
			if (!url || !name) return;
			try {
				await forceDownload(url, name);
			} catch {
				container.textContent = messages.listFailed;
			}
		};
		container.innerHTML = `
			<div class="d-grid gap-1">
				${links
					.map(
						(link) =>
							`<a class="text-decoration-none" href="${utils.escapeHtml(link.url)}" data-file="${utils.escapeHtml(
								link.filePath,
							)}" data-url="${utils.escapeHtml(link.url)}">${utils.escapeHtml(link.filePath)}</a>`,
					)
					.join("")}
			</div>
		`;
		container.addEventListener("click", handleDownload);
	} catch (error) {
		const code = (error as Error).message;
		if (code === "UNAVAILABLE") {
			container.textContent = messages.unavailable;
			return;
		}
		if (code === "GAME_JSON_FETCH_FAILED") {
			container.textContent = messages.gameJsonFailed;
			return;
		}
		container.textContent = messages.listFailed;
	}
}
