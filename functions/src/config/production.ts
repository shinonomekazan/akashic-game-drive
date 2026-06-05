import { Config } from "./index";

import defaultConfig = require("./default");

const ProductionConfig: Config = {
	...defaultConfig,
};

ProductionConfig.app.storageBucket = "akashic-game-drive.firebasestorage.app";
ProductionConfig.app.assetStorageBucket = "akashic-game-drive-contents";
ProductionConfig.app.assetPathPrefix = "contents";
ProductionConfig.app.assetCacheControl = "public, max-age=3600";

export = ProductionConfig;
