#!/usr/bin/env node

// +--------------------------------------------------------------
// <copyright file="cli.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview CLI entry point for OASIS OData to OpenAPI Converter.
// Thin dispatcher that routes to command modules. All business logic
// lives in the core engine; telemetry uses the shared TelemetryClient.
// ---------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const { SUPPORTED_EXTENSIONS, EXIT_CODE } = require("../core/constants.js");
const { TelemetryClient, nodeHttpsTransport } = require("../core/telemetry/index.js");

const convertCmd = require("./commands/convert.js");
const batchCmd = require("./commands/batch.js");
const infoCmd = require("./commands/info.js");

// Version injected at build time; falls back to package.json in dev.
/* global __VERSION__ */
const VERSION =
  typeof __VERSION__ !== "undefined"
    ? __VERSION__
    : JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version;

// App Insights key injected at build time; falls back to env var.
/* global __APPINSIGHTS_IKEY__ */
const APPINSIGHTS_IKEY =
  typeof __APPINSIGHTS_IKEY__ !== "undefined"
    ? __APPINSIGHTS_IKEY__
    : (process.env.OASIS_APPINSIGHTS_IKEY || "");

/**
 * Persistent per-user pseudonymous ID.
 * Stored in ~/.oasis/uid so each OS user account gets a unique ID,
 * even on shared machines. Falls back to hostname hash if file I/O fails.
 */
function getOrCreateUid() {
  const configDir = path.join(os.homedir(), ".oasis");
  const uidFile = path.join(configDir, "uid");

  try {
    // Try to read existing UID
    const existing = fs.readFileSync(uidFile, "utf8").trim();
    if (existing && existing.length >= 8) return existing;
  } catch {
    // File doesn't exist yet — will create below
  }

  // Generate new UID
  const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(uidFile, uid, "utf8");
  } catch {
    // If we can't persist (e.g., CI, read-only FS), fall back to hostname hash
    return crypto.createHash("sha256").update(os.hostname()).digest("hex").slice(0, 12);
  }

  return uid;
}

const HOST_ID = getOrCreateUid();

// Initialize shared telemetry client
const telemetry = new TelemetryClient({
  ikey: APPINSIGHTS_IKEY,
  transport: nodeHttpsTransport,
  uid: HOST_ID,
  src: "cli",
});

/**
 * CLI context passed to all commands.
 * Provides telemetry without commands needing to know transport details.
 */
const ctx = {
  emitTrace: (params) => telemetry.trackConvert(params),
};

const COMMANDS = ["convert", "batch", "info", "version", "help"];

function showMainHelp() {
  console.log(`
odata-converter v${VERSION}
OASIS OData to OpenAPI Converter

Usage:
  odata-converter <command> [FLAGS]... [ARGS]...

Available Commands:
  convert     Convert a single OData CSDL file to OpenAPI 3.0 format
  batch       Convert all OData CSDL files in one or more directories
  info        Display information about an OData CSDL file
  version     Display the application version
  help        Display help information

Flags:
  -h, --help      Show help for a command
  -v, --version   Show version number

Use "odata-converter <command> --help" for more information about a command.

Supported input formats:
  ${SUPPORTED_EXTENSIONS.join(", ")}

Examples:
  odata-converter convert service.xml api.json
  odata-converter batch -t ./output ./input
  odata-converter info service.xml
  odata-converter version

`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showMainHelp();
    process.exit(EXIT_CODE.SUCCESS);
  }

  if (args[0] === "--help" || args[0] === "-h") {
    showMainHelp();
    process.exit(EXIT_CODE.SUCCESS);
  }
  if (args[0] === "--version" || args[0] === "-v") {
    console.log(`v${VERSION}`);
    process.exit(EXIT_CODE.SUCCESS);
  }

  const command = args[0];
  const subArgs = args.slice(1);

  switch (command) {
    case "convert":
      await convertCmd.execute(subArgs, ctx);
      break;

    case "batch":
      await batchCmd.execute(subArgs, ctx);
      break;

    case "info":
      await infoCmd.execute(subArgs, ctx);
      break;

    case "version":
      console.log(`v${VERSION}`);
      break;

    case "help":
      if (subArgs.length > 0 && COMMANDS.includes(subArgs[0])) {
        switch (subArgs[0]) {
          case "convert": convertCmd.showHelp(); break;
          case "batch": batchCmd.showHelp(); break;
          case "info": infoCmd.showHelp(); break;
          default: showMainHelp(); break;
        }
      } else {
        showMainHelp();
      }
      break;

    default:
      console.error(`Error: Unknown command "${command}".`);
      console.error('Run "odata-converter help" for usage information.');
      process.exit(EXIT_CODE.ERROR);
      break;
  }
}

main();
