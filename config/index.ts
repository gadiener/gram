import dotenv from "dotenv";
import { loadConfig } from "@gram/core/dist/config/index.js";
import { registerConfiguration } from "@gram/core/dist/config/configMap.js";
import { developmentConfig } from "./development.js";

export function initConfig() {
  dotenv.config({ path: "../.env" });
  registerConfiguration("development", developmentConfig);
  //   registerConfiguration("staging", stagingConfig);
  //   registerConfiguration("production", productionConfig);
  loadConfig();
}
