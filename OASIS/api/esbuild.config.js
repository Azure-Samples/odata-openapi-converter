// +--------------------------------------------------------------
// <copyright file="esbuild.config.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Build configuration for the OASIS API (Azure Functions).
// Bundles convert-handler.js with all local (core/) and npm dependencies
// into a single file so Azure Static Web Apps can deploy it without
// needing the core/ folder at a relative path.
// ---------------------------------------------------------------

const path = require("path");
const { build } = require("esbuild");

build({
  entryPoints: ["src/functions/convert.js"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: "dist/functions/convert.js",
  external: ["@azure/functions"],
  nodePaths: [path.resolve(__dirname, "../node_modules")],
  logOverride: {
    "empty-import-meta": "silent",
  },
}).then(() => {
  console.log("✓ API build complete — dist/functions/convert.js");
});
