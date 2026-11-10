"use strict";

// Starts the FixNow API for local testing with safe development settings.
// Data lives in work/fixnow-backend/local-data (ignored by Git). Never point this at production data.
const { localDataDir, localSettings } = require("./common");

const settings = localSettings();
Object.assign(process.env, {
  PORT: process.env.PORT || "4180",
  HOST: "127.0.0.1",
  APP_ENV: "development",
  REQUIRE_HTTPS: "0",
  DATA_DIR: localDataDir,
  SEED_DEMO_ACCOUNTS: "1",
  // QA runs in three browser engines and two themes submit many reports from this PC in one hour.
  PUBLIC_REPORT_LIMIT_PER_HOUR: "500",
  BOOTSTRAP_ADMIN_PASSWORD: settings.adminPassword,
  ATTACHMENT_SIGNING_SECRET: settings.signingSecret
});

// server.js reads its settings when it loads, so the environment must be set first.
require("../fixnow-backend/server.js").startServer();
console.log("Local admin password is in work/fixnow-backend/local-data/local-dev-settings.json (local use only).");
