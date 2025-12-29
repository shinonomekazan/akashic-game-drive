import { Config } from "./index";

import defaultConfig = require("./default");

const ProductionConfig: Config = {
	...defaultConfig,
};

ProductionConfig.app.storageBucket = "akashic-game-drive.firebasestorage.app";

export = ProductionConfig;
