import { Config } from "./index";

const DefaultConfig: Config = {
	app: {
		port: 3000,
		storageBucket: "akashic-game-drive.firebasestorage.app",
		assetStorageBucket: "akashic-game-drive-contents",
		assetPathPrefix: "contents",
		assetCacheControl: "public, max-age=3600",
	},
};

export = DefaultConfig;
