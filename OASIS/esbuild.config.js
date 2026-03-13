// +--------------------------------------------------------------
// <copyright file="esbuild.config.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Build configuration for the OASIS OData to OpenAPI Converter.
// Reads build-time secrets from .env.build (git-ignored) and injects them
// as compile-time constants via esbuild's --define mechanism.
// ---------------------------------------------------------------

const { build } = require("esbuild");
const { readFileSync, existsSync } = require("fs");

// Read version: env var (set by CI from git tag) takes precedence over package.json.
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const PKG_VERSION = process.env.OASIS_VERSION || pkg.version;

/**
 * Reads key=value pairs from a dotenv-style file.
 * Ignores blank lines and comments (#).
 *
 * @param {string} filePath - Path to the env file
 * @returns {Record<string, string>} Parsed key-value pairs
 */
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  const vars = {};

  readFileSync(filePath, "utf8")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) return;

      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      vars[key] = value;
    });

  return vars;
}

// Read secrets: .env.build file takes precedence, then process.env fallback.
const envFile = parseEnvFile(".env.build");

const APPINSIGHTS_IKEY =
  envFile.OASIS_APPINSIGHTS_IKEY ||
  process.env.OASIS_APPINSIGHTS_IKEY ||
  "";

build({
  entryPoints: ["cli/cli.js"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/cli-bundled.cjs",
  logOverride: {
    "empty-import-meta": "silent",
  },
  define: {
    __APPINSIGHTS_IKEY__: JSON.stringify(APPINSIGHTS_IKEY),
    __VERSION__: JSON.stringify(PKG_VERSION),
  },
}).then(() => {
  console.log("✓ Build complete — dist/cli-bundled.cjs");
});
