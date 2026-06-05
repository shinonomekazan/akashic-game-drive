import { Config } from "./index";

import defaultConfig = require("./default");

const DebugConfig: Config = {
	...defaultConfig,
};

DebugConfig.app.assetStorageBucket = DebugConfig.app.storageBucket;

export = DebugConfig;
