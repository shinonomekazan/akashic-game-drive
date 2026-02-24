import AdmZip from "adm-zip";
import * as path from "path";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";
import { eraseUndefined } from "./utils";
import { getFirebaseApp } from "./firebase";

const ZIP_MIME_TYPES = ["application/zip", "application/x-zip-compressed"];
const WARNING_GAME_JSON_MISSING = "game.jsonが見つかりません";
const WARNING_INVALID_FILE_LIST = "game.jsonに不正なファイルが含まれています";
const WARNING_NETWORK_ACCESS = "ネットワークアクセスが検知されました";
const WARNING_MATH_RANDOM = "Math.randomの利用があります";
const WARNING_DATE = "Dateの利用があります";
const CODE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);
const EXTRACTION_CONCURRENCY = 10;

interface ZipEntry {
	entryName: string;
	isDirectory?: boolean;
	getData: () => Buffer;
}

interface NormalizedEntry {
	entry: ZipEntry;
	normalizedPath: string;
}

interface ValidationResult {
	state: "ok" | "failed";
	warnings: string[];
	trusted?: boolean;
}

function isZipObject(objectName: string, contentType?: string | null) {
	const lowerName = objectName.toLowerCase();
	return lowerName.endsWith(".zip") || (contentType ? ZIP_MIME_TYPES.includes(contentType) : false);
}

function isTopLevelZipObject(objectName: string) {
	const lowerName = objectName.toLowerCase();
	if (lowerName.includes(".zip/")) return false;
	const parts = objectName.split("/");
	if (parts.length < 4) return false;
	if (parts[0] !== "uploads" || parts[2] !== "contents" || parts[3] !== "zip") return false;
	if (parts.length === 6) return parts[5].toLowerCase().endsWith(".zip");
	if (parts.length === 5) return parts[4].toLowerCase().endsWith(".zip");
	return false;
}

function normalizeZipPath(rawPath: string): string | null {
	const cleaned = rawPath.replace(/\\/g, "/").trim();
	if (!cleaned) return null;
	const withoutLeading = cleaned.replace(/^(?:\.\/)+/, "").replace(/^\/+/, "");
	if (!withoutLeading) return null;
	const segments = withoutLeading.split("/").filter((segment) => segment.length > 0 && segment !== ".");
	if (segments.some((segment) => segment === "..")) return null;
	return segments.join("/");
}

function isDirectoryEntry(entry: ZipEntry): boolean {
	return Boolean(entry.isDirectory) || entry.entryName.endsWith("/");
}

function collectExpectedPaths(gameJson: Record<string, unknown>) {
	const paths = new Set<string>();
	const invalidPaths: string[] = [];
	const validatedAudioPaths = new Set<string>();

	const addPath = (value: unknown,type?: unknown, hint?: { extensions?: unknown[]}) => {
		if (typeof value !== "string") return;
		const normalized = normalizeZipPath(value);
		if (!normalized) {
			invalidPaths.push(value);
			return;
		}
		paths.add(normalized);
		if(typeof type==="string" && type === "audio" && typeof hint==="object" && Array.isArray(hint.extensions)) {
			if(hint.extensions.includes(".ogg")){
				if(hint.extensions.includes(".aac")) {
					validatedAudioPaths
					.add(normalized)
					.add(normalized + ".ogg")
					.add(normalized + ".aac");
				}else if(hint.extensions.includes(".m4a")) {
					validatedAudioPaths
					.add(normalized)
					.add(normalized + ".ogg")
					.add(normalized + ".m4a");
				}
			}
		}
	};

	const assets = (gameJson.assets ?? gameJson.asset) as Record<string, { path?: unknown,type?: unknown, hint?: { extensions?: unknown[]} }> | undefined;
	if (assets && typeof assets === "object") {
		Object.values(assets).forEach((asset) => {
			if (typeof asset?.path === "string" && asset.path.trim().toLowerCase().endsWith(".zip")) {
				invalidPaths.push(asset.path);
				return;
			}
			addPath(asset?.path,asset?.type,asset?.hint);
		});
	}

	const globalScripts = gameJson.globalScripts as Record<string, unknown> | undefined;
	if (globalScripts && typeof globalScripts === "object") {
		Object.values(globalScripts).forEach((value) => {
			addPath(value);
		});
	}
	return { paths, invalidPaths ,validatedAudioPaths };
}

function scanForDisallowedUsage(entries: NormalizedEntry[]) {
	let hasNetworkAccess = false;
	let hasMathRandom = false;
	let hasDate = false;
	const fetchRegex = /\bfetch\b/;
	const xhrRegex = /\bXMLHttpRequest\b/;
	const mathRandomRegex = /\bMath\.random\b/;
	const dateRegex = /\bnew\s+Date\b|\bDate\./;

	for (const entry of entries) {
		const ext = path.posix.extname(entry.normalizedPath).toLowerCase();
		if (!CODE_EXTENSIONS.has(ext)) continue;
		const content = entry.entry.getData().toString("utf8");
		if (fetchRegex.test(content) || xhrRegex.test(content)) {
			hasNetworkAccess = true;
		}
		if (mathRandomRegex.test(content)) {
			hasMathRandom = true;
		}
		if (dateRegex.test(content)) {
			hasDate = true;
		}
		if (hasNetworkAccess && hasMathRandom && hasDate) break;
	}

	return { hasNetworkAccess, hasMathRandom, hasDate };
}

function validateZipContents(zip: { getEntries: () => ZipEntry[] }) {
	const entries = zip.getEntries() as ZipEntry[];
	const normalizedEntries: NormalizedEntry[] = [];
	const actualPaths = new Set<string>();
	const invalidEntryPaths: string[] = [];

	for (const entry of entries) {
		if (isDirectoryEntry(entry)) continue;
		const normalized = normalizeZipPath(entry.entryName);
		if (!normalized) {
			invalidEntryPaths.push(entry.entryName);
			continue;
		}
		actualPaths.add(normalized);
		normalizedEntries.push({ entry, normalizedPath: normalized });
	}

	const gameJsonEntry = normalizedEntries.find((entry) => entry.normalizedPath === "game.json");
	if (!gameJsonEntry) {
		return {
			result: {
				state: "failed",
				warnings: [WARNING_GAME_JSON_MISSING],
			} as ValidationResult,
			entries: normalizedEntries,
		};
	}

	let gameJson: Record<string, unknown>;
	try {
		gameJson = JSON.parse(gameJsonEntry.entry.getData().toString("utf8")) as Record<string, unknown>;
	} catch {
		return {
			result: {
				state: "failed",
				warnings: [WARNING_INVALID_FILE_LIST],
			} as ValidationResult,
			entries: normalizedEntries,
		};
	}

	const { paths: expectedPaths, invalidPaths, validatedAudioPaths } = collectExpectedPaths(gameJson);
	expectedPaths.add("game.json");

	if (invalidEntryPaths.length > 0 || invalidPaths.length > 0) {
		return {
			result: {
				state: "failed",
				warnings: [WARNING_INVALID_FILE_LIST],
			} as ValidationResult,
			entries: normalizedEntries,
		};
	}

	const specialPaths = ["library_license.txt"];
	specialPaths.forEach((specialPath) => {
		if (actualPaths.has(specialPath)) {
			expectedPaths.add(specialPath);
		}
	});

	const missingPaths = [...expectedPaths].filter(
		(expected) => !actualPaths.has(expected) && !validatedAudioPaths.has(expected),
	);
	const extraPaths = [...actualPaths].filter(
		(actual) => !expectedPaths.has(actual) && !validatedAudioPaths.has(actual),
	);

	if (missingPaths.length > 0 || extraPaths.length > 0) {
		return {
			result: {
				state: "failed",
				warnings: [WARNING_INVALID_FILE_LIST],
			} as ValidationResult,
			entries: normalizedEntries,
		};
	}

	const warnings = new Set<string>();
	const { hasNetworkAccess, hasMathRandom, hasDate } = scanForDisallowedUsage(normalizedEntries);
	if (hasNetworkAccess) warnings.add(WARNING_NETWORK_ACCESS);
	if (hasMathRandom) warnings.add(WARNING_MATH_RANDOM);
	if (hasDate) warnings.add(WARNING_DATE);

	const result: ValidationResult = {
		state: "ok",
		warnings: [...warnings],
	};
	if (warnings.size > 0) {
		result.trusted = false;
	}

	return { result, entries: normalizedEntries };
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
	const queue = [...items];
	const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
		while (queue.length > 0) {
			const item = queue.shift();
			if (!item) return;
			await worker(item);
		}
	});
	await Promise.all(workers);
}

async function extractZipEntries(entries: NormalizedEntry[], bucket: Bucket, targetPrefix: string) {
	const tasks = entries.map((entry) => async () => {
		const data = entry.entry.getData();
		const destination = path.posix.join(targetPrefix, entry.normalizedPath);
		await bucket.file(destination).save(data, { resumable: false });
	});
	await runWithConcurrency(tasks, EXTRACTION_CONCURRENCY, (task) => task());
}

function buildStorageUrl(bucketName: string, objectName: string) {
	return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectName)}?alt=media`;
}

function buildExtractPrefix(objectName: string) {
	const dir = path.posix.dirname(objectName);
	const base = path.posix.basename(objectName);
	return dir === "." ? base : path.posix.join(dir, base);
}

function parseContentIdFromObjectName(objectName: string) {
	const parts = objectName.split("/");
	// 6-part format: uploads/{uid}/contents/zip/{contentId}/{filename}.zip
	if (parts.length === 6) {
		if (parts[0] !== "uploads" || parts[2] !== "contents" || parts[3] !== "zip") return null;
		if (!parts[5].toLowerCase().endsWith(".zip")) return null;
		return parts[4] || null;
	}
	// 5-part format: uploads/{uid}/contents/zip/{filename}.zip
	if (parts.length === 5) {
		if (parts[0] !== "uploads" || parts[2] !== "contents" || parts[3] !== "zip") return null;
		const filename = parts[4];
		if (!filename.toLowerCase().endsWith(".zip")) return null;
		const contentId = filename.slice(0, -4);
		return contentId || null;
	}
	return null;
}

async function processZipFile(bucketName: string, objectName: string, contentRef: DocumentReference) {
	const app = await getFirebaseApp();
	const storage = getStorage(app);
	const bucket = storage.bucket(bucketName);
	const file = bucket.file(objectName);

	try {
		const [data] = await file.download();
		const zip = new AdmZip(data);
		const { result, entries } = validateZipContents(zip);

		const extractPrefix = buildExtractPrefix(objectName);
		let deletedZip = false;
		if (result.state === "ok") {
			await extractZipEntries(entries, bucket, extractPrefix);
			try {
				await file.delete();
				deletedZip = true;
			} catch (error) {
				const code = (error as { code?: number }).code;
				if (code === 404) {
					deletedZip = true;
				}
			}
		}

		await contentRef.update(
			eraseUndefined({
				state: result.state,
				warnings: result.warnings,
				trusted: result.trusted,
				extractedPath: result.state === "ok" ? extractPrefix : null,
				zipUrl: deletedZip ? null : undefined,
			}),
		);
	} catch (error) {
		await contentRef.update(
			eraseUndefined({
				state: "failed",
				warnings: [WARNING_INVALID_FILE_LIST],
				extractedPath: null,
			}),
		);
		throw error;
	}
}

export async function handleStorageZipFinalize(event: {
	data?: { name?: string; bucket?: string; contentType?: string };
}) {
	const object = event.data;
	if (!object?.name || !object.bucket) return;
	if (!isZipObject(object.name, object.contentType)) return;
	if (!object.name.startsWith("uploads/")) return;
	if (!isTopLevelZipObject(object.name)) return;

	const app = await getFirebaseApp();
	const firestore = getFirestore(app);
	const contentId = parseContentIdFromObjectName(object.name);
	if (contentId) {
		const contentRef = firestore.collection("contents").doc(contentId);
		const snapshot = await contentRef.get();
		if (!snapshot.exists) return;
		await processZipFile(object.bucket, object.name, contentRef);
		return;
	}

	const zipUrl = buildStorageUrl(object.bucket, object.name);
	const snapshot = await firestore.collection("contents").where("zipUrl", "==", zipUrl).limit(1).get();
	if (snapshot.empty) return;
	const contentRef = snapshot.docs[0].ref;
	await processZipFile(object.bucket, object.name, contentRef);
}
