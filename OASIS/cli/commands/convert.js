// +--------------------------------------------------------------
// <copyright file="convert.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview CLI "convert" command — single-file conversion.
// ---------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { convertFile, SDK_WARNING_NOTE, EXIT_CODE } = require("../../core/index.js");
const { parseFlags } = require("../flags.js");
const { printElapsed } = require("../output.js");

/**
 * Shows help for the convert command.
 */
function showHelp() {
  console.log(`
Convert a single OData CSDL file to OpenAPI 3.0 format.

The input file can be OData CSDL XML (.xml, .edmx) or JSON (.json).
If no output file is specified, the output is saved alongside the input
file with a "-openapi.json" suffix.

Usage:
  odata-converter convert [FLAGS]... INPUT_FILE [OUTPUT_FILE]

Flags:
  -o, --output-file string   Output file path (overrides positional OUTPUT_FILE)
  -s, --server-url  string   The base URL for the generated OpenAPI spec (e.g., https://your-sap-server.com/sap/opu/odata/sap/API_NAME)
  -T, --title       string   Custom title is how users find this API in the APIM workspace
  -A, --apply                Add the $apply (aggregation) query option to all collection endpoints
  -V, --verbose              Show detailed step-by-step conversion logs
  -h, --help                 Show this help message

Examples:
  odata-converter convert input.xml
  odata-converter convert input.xml output.json
  odata-converter convert -T "Business Partner API" input.xml
  odata-converter convert -A input.xml
  odata-converter convert -s https://myserver.com/sap/opu/odata/sap/API_SALES_ORDER input.xml
  odata-converter convert -o output.json input.xml
  odata-converter convert -V input.xml output.json
`);
}

/**
 * Executes the convert command.
 *
 * @param {string[]} args - Arguments after "convert"
 * @param {{ emitTrace: function }} ctx - CLI context with telemetry
 */
async function execute(args, ctx) {
  const { flags, positionalArgs } = parseFlags(args, {
    "output-file": { short: "o", type: "string" },
    "server-url": { short: "s", type: "string" },
    title: { short: "T", type: "string" },
    apply: { short: "A", type: "boolean" },
    verbose: { short: "V", type: "boolean" },
    help: { short: "h", type: "boolean" },
  });

  if (flags.help) {
    showHelp();
    process.exit(EXIT_CODE.SUCCESS);
  }

  if (positionalArgs.length === 0) {
    console.error("Error: INPUT_FILE is required.");
    showHelp();
    process.exit(EXIT_CODE.ERROR);
  }

  const inputPath = path.resolve(positionalArgs[0]);

  let outputPath;
  if (flags["output-file"]) {
    outputPath = path.resolve(flags["output-file"]);
  } else if (positionalArgs.length >= 2) {
    outputPath = path.resolve(positionalArgs[1]);
  } else {
    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, path.extname(inputPath));
    outputPath = path.join(dir, `${base}-openapi.json`);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    await ctx.emitTrace({ ok: 0, fail: 0, skipped: [positionalArgs[0]], skipReason: "FILE_NOT_FOUND", ms: 0 });
    process.exit(EXIT_CODE.ERROR);
  }

  if (!fs.statSync(inputPath).isFile()) {
    console.error(`Error: Input path is not a file: ${inputPath}`);
    console.error('Hint: Use "odata-converter batch" to convert directories.');
    await ctx.emitTrace({ ok: 0, fail: 0, skipped: [positionalArgs[0]], skipReason: "NOT_A_FILE", ms: 0 });
    process.exit(EXIT_CODE.ERROR);
  }

  const verbose = flags.verbose || false;
  const log = verbose ? console.log : () => {};
  const startTime = Date.now();

  // Parse server URL into csdl2openapi options
  const options = {};
  if (flags["server-url"]) {
    try {
      const url = new URL(flags["server-url"]);
      options.scheme = url.protocol.replace(":", "");
      options.host = url.host;
      options.basePath = url.pathname || "/";
    } catch {
      console.error(`Error: Invalid --server-url. Must be a valid URL (e.g., https://myserver.com/sap/opu/odata/sap/API_NAME).`);
      process.exit(EXIT_CODE.ERROR);
    }
  }
  if (flags.title) {
    options.defaultTitle = flags.title;
  }
  if (flags.apply) {
    options.includeApply = true;
  }

  try {
    console.log(`Reading: ${path.basename(inputPath)}`);
    console.log("Converting...");

    const { outputPath: out, warnings } = convertFile(inputPath, outputPath, options, log);

    if (warnings && warnings.length > 0) {
      console.log(`\n\u26a0 ${warnings.length} warning(s):`);
      warnings.forEach((w) => console.log(`  - ${w}`));
      console.log(`\n\u2139 ${SDK_WARNING_NOTE}`);
    }

    console.log("\u2713 Conversion completed successfully!");
    console.log(`Output: ${out}`);

    const elapsed = Date.now() - startTime;
    await ctx.emitTrace({ ok: 1, fail: 0, errors: null, ms: elapsed });
    printElapsed(elapsed, 1);
  } catch (error) {
    console.error("\u2717 Conversion failed:");
    console.error(`  ${error.message}`);

    const elapsed = Date.now() - startTime;
    const fname = path.basename(inputPath);
    if (error.code === "UNSUPPORTED_EXTENSION") {
      await ctx.emitTrace({ ok: 0, fail: 0, skipped: [fname], skipReason: "UNSUPPORTED_EXTENSION", ms: elapsed });
    } else {
      await ctx.emitTrace({ ok: 0, fail: 1, errors: [{ message: error.message, code: error.code, file: fname }], ms: elapsed });
    }
    printElapsed(elapsed, 1);
    process.exit(EXIT_CODE.ERROR);
  }
}

module.exports = { execute, showHelp };
