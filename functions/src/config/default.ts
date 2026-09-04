import { Config } from "./index";

const runtimePathPrefix = process.env.AKASHIC_RUNTIME_PATH_PREFIX || "runtime";

const DefaultConfig: Config = {
	app: {
		port: 3000,
		storageBucket: "akashic-game-drive.firebasestorage.app",
		assetStorageBucket: "akashic-game-drive-contents",
		assetPathPrefix: "contents",
		assetPublicBaseUrl: "https://drive.akashic.shinonomekazan.com",
		assetCacheControl: "public, max-age=3600",
		runtimePathPrefix,
	},
};

export = DefaultConfig;
