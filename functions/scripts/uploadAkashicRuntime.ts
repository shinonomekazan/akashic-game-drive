import AdmZip from "adm-zip";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import * as fw from "../src/fw";
import type { Config } from "../src/config";

const DEFAULT_DIST_URL =
	"https://github.com/akashic-games/akashic-runtime-distributables/releases/download/2026-03-10/dist.zip";
const FUNCTIONS_DIR = path.resolve(__dirname, "..");

interface Args {
	zipPath?: string;
	releaseUrl: string;
	bucketName?: string;
	prefix?: string;
	cacheControl?: string;
	dotenvFile?: string;
	dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		releaseUrl: DEFAULT_DIST_URL,
		dryRun: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--zip" && next) {
			args.zipPath = next;
			i++;
		} else if (arg === "--release-url" && next) {
			args.releaseUrl = next;
			i++;
		} else if (arg === "--bucket" && next) {
			args.bucketName = next;
			i++;
		} else if (arg === "--prefix" && next) {
			args.prefix = next;
			i++;
		} else if (arg === "--cache-control" && next) {
			args.cacheControl = next;
			i++;
		} else if (arg === "--dotenv-file" && next) {
			args.dotenvFile = next;
			i++;
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		}
	}
	return args;
}

function download(url: string, destination: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = https.get(url, (response) => {
			const status = response.statusCode ?? 0;
			const location = response.headers.location;
			if (status >= 300 && status < 400 && location) {
				response.resume();
				download(new URL(location, url).toString(), destination).then(resolve, reject);
				return;
			}
			if (status < 200 || status >= 300) {
				response.resume();
				reject(new Error(`Download failed: ${status}`));
				return;
			}
			const file = fs.createWriteStream(destination);
			response.pipe(file);
			file.on("finish", () => {
				file.close();
				resolve();
			});
			file.on("error", reject);
		});
		request.on("error", reject);
	});
}

function detectContentType(filePath: string) {
	switch (path.posix.extname(filePath).toLowerCase()) {
		case ".js":
			return "text/javascript";
		case ".md":
			return "text/markdown";
		case ".txt":
			return "text/plain";
		default:
			return "application/octet-stream";
	}
}

function loadLocalEnv(envFile?: string) {
	const envPath = envFile ? path.resolve(envFile) : path.join(FUNCTIONS_DIR, ".env");
	dotenv.config({ path: envPath });
	const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
	if (credentialsPath && !path.isAbsolute(credentialsPath)) {
		process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(FUNCTIONS_DIR, credentialsPath);
	}
}

function printAuthHint(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	if (!message.includes("invalid_grant")) return;
	console.error(
		[
			"",
			"Google authentication failed with invalid_grant.",
			"Check GOOGLE_APPLICATION_CREDENTIALS in functions/.env, or refresh local ADC with:",
			"  gcloud auth application-default login",
			"Also verify your machine clock is correct and the service account key has not been revoked.",
		].join("\n"),
	);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	loadLocalEnv(args.dotenvFile);
	const config = await fw.Configure<Config>(path.resolve(__dirname, "../src/config"));
	const bucketName = args.bucketName ?? config.app.assetStorageBucket;
	const prefix = (args.prefix ?? config.app.runtimePathPrefix).replace(/^\/+|\/+$/g, "") || "runtime";
	const cacheControl = args.cacheControl ?? config.app.assetCacheControl;
	const zipPath = args.zipPath ?? path.join(os.tmpdir(), "akashic-runtime-distributables.zip");

	if (!args.zipPath) {
		console.log(`Downloading ${args.releaseUrl}`);
		await download(args.releaseUrl, zipPath);
	}

	const zip = new AdmZip(zipPath);
	const entries = zip
		.getEntries()
		.filter((entry) => !entry.isDirectory && entry.entryName.startsWith("dist/"))
		.map((entry) => {
			const relativePath = entry.entryName.replace(/^dist\//, "");
			return {
				entry,
				destination: path.posix.join(prefix, relativePath),
			};
		});

	if (entries.length === 0) {
		throw new Error("No runtime files found under dist/");
	}

	if (args.dryRun) {
		entries.forEach(({ destination }) => console.log(`[dry-run] ${bucketName}/${destination}`));
		return;
	}

	const app = initializeApp();
	const bucket = getStorage(app).bucket(bucketName);
	for (const { entry, destination } of entries) {
		await bucket.file(destination).save(entry.getData(), {
			resumable: false,
			contentType: detectContentType(destination),
			metadata: {
				cacheControl,
			},
		});
		console.log(`Uploaded gs://${bucketName}/${destination}`);
	}
}

main().catch((error) => {
	console.error(error);
	printAuthHint(error);
	process.exitCode = 1;
});
