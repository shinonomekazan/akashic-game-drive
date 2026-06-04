import { Config } from "./index";

import defaultConfig = require("./default");

const DevelopmentConfig: Config = {
	...defaultConfig,
};

DevelopmentConfig.app.assetStorageBucket = DevelopmentConfig.app.storageBucket;

export = DevelopmentConfig;
