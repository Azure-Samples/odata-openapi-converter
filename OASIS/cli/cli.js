#!/usr/bin/env node

// +--------------------------------------------------------------
// <copyright file="cli.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview CLI entry point for OASIS OData to OpenAPI Converter.
// Provides subcommand-based interface inspired by unipdf-cli for
// converting OData CSDL (XML/JSON) specifications to OpenAPI 3.0 format.
//
// Commands:
//   convert  - Convert a single OData CSDL file
//   batch    - Convert all files in one or more directories
//   info     - Display file metadata and validation
//   version  - Display version
//   help     - Display help information
// ---------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const https = require("https");
const { convertFile } = require("../api/lib/converter.js");
const { SDK_WARNING_NOTE, SUPPORTED_EXTENSIONS, FORMAT } = require("../api/lib/constants.js");
const { detectFormat } = require("../api/lib/validation.js");

// Version is injected at build time via esbuild (see esbuild.config.js).
// In dev mode (un-bundled), falls back to reading package.json.
/* global __VERSION__ */
const VERSION =
  typeof __VERSION__ !== "undefined"
    ? __VERSION__
    : JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version;

// Constants
const SEPARATOR = "=".repeat(60);
const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  ERROR: 1,
});

// App Insights ingestion endpoint (track v2 API).
// IKEY is injected at build time via esbuild --define (see esbuild.config.js).
// In dev mode (un-bundled), falls back to env var. Empty string = telemetry off.
/* global __APPINSIGHTS_IKEY__ */
const APPINSIGHTS_IKEY = typeof __APPINSIGHTS_IKEY__ !== "undefined"
  ? __APPINSIGHTS_IKEY__
  : (process.env.OASIS_APPINSIGHTS_IKEY || "");
const APPINSIGHTS_INGESTION_URL = "https://dc.services.visualstudio.com/v2/track";

/**
 * 12-char SHA-256 prefix of the machine hostname.
 * Acts as a pseudonymous user identifier — 48 bits gives
 * <1% collision probability up to ~20 million users.
 */
const HOST_ID = crypto
  .createHash("sha256")
  .update(os.hostname())
  .digest("hex")
  .slice(0, 12);

const COMMANDS = ["convert", "batch", "info", "version", "help"];

/**
 * Builds and emits a single "OasisRun" event to App Insights.
 * Schema is aligned with the web telemetry so both surfaces
 * land in the same table and are queryable identically.
 *
 * ┌──────────┬──────────────────────────────────────────────────┐
 * │ Column   │ Description                                     │
 * ├──────────┼──────────────────────────────────────────────────┤
 * │ ts       │ ISO-8601 precise timestamp                       │
 * │ rid      │ Run id (8-char hex)                              │
 * │ uid      │ Hostname hash prefix (pseudonymous, 12 hex)     │
 * │ src      │ "cli"                                           │
 * │ act      │ "convert"                                       │
 * │ tot      │ Total files                                     │
 * │ ok       │ Successful                                      │
 * │ fail     │ Failed                                          │
 * │ warn     │ Files with warnings                             │
 * │ st       │ "ok" | "partial" | "fail" | "skipped"          │
 * │ errors   │ Raw JSON array of per-file error objects          │
 * │ skipped  │ Count of skipped files                           │
 * │ skipRsn  │ Why skipped (FILE_NOT_FOUND, NOT_A_FILE, etc.)  │
 * │ ms       │ Wall-clock milliseconds                         │
 * │ dl       │ Always "0" for CLI                              │
 * └──────────┴──────────────────────────────────────────────────┘
 *
 * @param {object}     p
 * @param {number}     p.ok         - successful conversion count
 * @param {number}     p.fail       - failed conversion count
 * @param {number}     [p.warn]     - files with warnings
 * @param {Array|null} p.errors     - [{ file, message, code }]
 * @param {string[]}   [p.skipped]  - filenames rejected before conversion
 * @param {string}     [p.skipReason] - machine-readable reason for skip
 * @param {number}     p.ms         - elapsed time in ms
 */
function emitTrace({ ok, fail, warn = 0, errors = null, skipped = null, skipReason = null, ms }) {
  const total = ok + fail;
  const st = skipped && skipped.length > 0
    ? "skipped"
    : fail === 0 ? "ok" : ok === 0 ? "fail" : "partial";

  const trace = {
    ts: new Date().toISOString(),
    rid: crypto.randomBytes(6).toString("hex"),
    uid: HOST_ID,
    src: "cli",
    tot: String(total),
    ok: String(ok),
    fail: String(fail),
    warn: String(warn),
    st,
    ms: String(Math.round(ms)),
    dl: "0",
  };

  if (fail > 0 && errors && errors.length > 0) {
    // 5xx codes (INTERNAL_ERROR, IO_ERROR): include scrubbed error message
    // for debugging.  4xx codes: send only the error code — messages may
    // contain personal data or local paths.
    const INTERNAL_CODES = new Set(["INTERNAL_ERROR", "IO_ERROR"]);
    const scrub = (s) => (s || "").replace(/[A-Z]:\\[^\s:)]+|\/[\w./-]+/gi, "<path>");
    trace.errors = JSON.stringify(
      errors.map((e) => {
        const code = e.code || "UNKNOWN";
        if (INTERNAL_CODES.has(code)) {
          return { type: code, error: scrub(e.message || String(e)) };
        }
        return { type: code };
      }),
    );
  }

  if (skipped && skipped.length > 0) {
    trace.skipped = String(skipped.length);
    if (skipReason) trace.skipRsn = skipReason;
  }

  // Send trace to App Insights silently — no console output.
  // Returns a promise so callers can await before process.exit().
  // Hard 3 s ceiling so CLI users never wait longer than that.
  if (APPINSIGHTS_IKEY) {
    const payload = JSON.stringify([
      {
        name: "AppEvents",
        iKey: APPINSIGHTS_IKEY,
        time: trace.ts,
        data: {
          baseType: "EventData",
          baseData: {
            name: "OasisRun",
            properties: trace,
          },
        },
      },
    ]);

    const send = new Promise((resolve) => {
      const req = https.request(
        APPINSIGHTS_INGESTION_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: 3000,
        },
        () => resolve(),
      );
      req.on("error", () => resolve());
      req.on("timeout", () => { req.destroy(); resolve(); });
      req.end(payload);
    });

    const deadline = new Promise((resolve) => setTimeout(resolve, 3000).unref());
    return Promise.race([send, deadline]);
  }
  return Promise.resolve();
}

/**
 * Parses flags and positional arguments from a raw args array.
 * Supports short (-o), long (--output-file), and boolean flags.
 *
 * @param {string[]} args - Raw argument tokens
 * @param {object} flagDefs - Map of flag names to { short, type }
 * @returns {{ flags: object, positionalArgs: string[] }}
 */
function parseFlags(args, flagDefs = {}) {
  const flags = {};
  const positionalArgs = [];

  // Build lookup maps: --long-name → key, -s → key
  const longMap = {};
  const shortMap = {};
  for (const [key, def] of Object.entries(flagDefs)) {
    longMap[`--${key}`] = { key, type: def.type || "boolean" };
    if (def.short) {
      shortMap[`-${def.short}`] = { key, type: def.type || "boolean" };
    }
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const entry = longMap[arg] || shortMap[arg];

    if (entry) {
      if (entry.type === "boolean") {
        flags[entry.key] = true;
      } else {
        // Value flag — next token is the value
        i++;
        if (i >= args.length) {
          console.error(`Error: Flag ${arg} requires a value.`);
          process.exit(EXIT_CODE.ERROR);
        }
        flags[entry.key] = args[i];
      }
    } else if (arg === "--") {
      // Everything after -- is positional
      positionalArgs.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith("-")) {
      console.error(`Error: Unknown flag "${arg}".`);
      process.exit(EXIT_CODE.ERROR);
    } else {
      positionalArgs.push(arg);
    }
  }

  return { flags, positionalArgs };
}

/**
 * Displays top-level usage information with available commands.
 *
 * @returns {void}
 */
function showMainHelp() {
  console.log(`
oasis-odata-openapi v${VERSION}
OASIS OData to OpenAPI Converter

Usage:
  oasis-odata-openapi <command> [FLAGS]... [ARGS]...

Available Commands:
  convert     Convert a single OData CSDL file to OpenAPI 3.0 format
  batch       Convert all OData CSDL files in one or more directories
  info        Display information about an OData CSDL file
  version     Display the application version
  help        Display help information

Flags:
  -h, --help      Show help for a command
  -v, --version   Show version number

Use "oasis-odata-openapi <command> --help" for more information about a command.

Supported input formats:
  ${SUPPORTED_EXTENSIONS.join(", ")}

Examples:
  oasis-odata-openapi convert service.xml api.json
  oasis-odata-openapi batch -t ./output ./input
  oasis-odata-openapi info service.xml
  oasis-odata-openapi version

`);
}

/**
 * Displays help for the convert subcommand.
 *
 * @returns {void}
 */
function showConvertHelp() {
  console.log(`
Convert a single OData CSDL file to OpenAPI 3.0 format.

The input file can be OData CSDL XML (.xml, .edmx) or JSON (.json).
If no output file is specified, the output is saved alongside the input
file with a "-openapi.json" suffix.

Usage:
  oasis-odata-openapi convert [FLAGS]... INPUT_FILE [OUTPUT_FILE]

Flags:
  -o, --output-file string   Output file path (overrides positional OUTPUT_FILE)
  -V, --verbose              Show detailed step-by-step conversion logs
  -h, --help                 Show this help message

Examples:
  oasis-odata-openapi convert input.xml
  oasis-odata-openapi convert input.xml output.json
  oasis-odata-openapi convert -o output.json input.xml
  oasis-odata-openapi convert -V input.xml output.json
  oasis-odata-openapi convert --verbose -o ./out/api.json ./in/service.edmx
`);
}

/**
 * Displays help for the batch subcommand.
 *
 * @returns {void}
 */
function showBatchHelp() {
  console.log(`
Convert all supported OData CSDL files in one or more directories to
OpenAPI 3.0 format.

The command accepts multiple directories as input. Each supported file
(${SUPPORTED_EXTENSIONS.join(", ")}) found in the input directories is converted
and saved to the target directory. By default, output files are written to
the same directory as the input files with a "-openapi.json" suffix.

Usage:
  oasis-odata-openapi batch [FLAGS]... INPUT_DIR...

Flags:
  -t, --target-dir string   Output directory for converted files
  -r, --recursive           Search for OData files in subdirectories
  -O, --overwrite           Overwrite existing output files
  -V, --verbose             Show detailed step-by-step conversion logs
  -h, --help                Show this help message

Examples:
  oasis-odata-openapi batch ./input
  oasis-odata-openapi batch -t ./output ./input
  oasis-odata-openapi batch -r ./input
  oasis-odata-openapi batch -t ./output -r ./input1 ./input2
  oasis-odata-openapi batch -O -r -t ./output ./specs
  oasis-odata-openapi batch -V -t ./output ./input
`);
}

/**
 * Displays help for the info subcommand.
 *
 * @returns {void}
 */
function showInfoHelp() {
  console.log(`
Display information about an OData CSDL file.

Outputs file metadata including format, size, detected schemas,
and basic validation results.

Usage:
  oasis-odata-openapi info [FLAGS]... INPUT_FILE

Flags:
  -h, --help   Show this help message

Examples:
  oasis-odata-openapi info service.xml
  oasis-odata-openapi info metadata.edmx
  oasis-odata-openapi info csdl-schema.json
`);
}

/**
 * Recursively collects all supported OData files from a directory tree.
 *
 * @param {string} dir - Root directory to scan
 * @returns {string[]} Array of absolute file paths
 */
function collectFilesRecursive(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Collects supported OData files from a single directory (non-recursive).
 *
 * @param {string} dir - Directory to scan
 * @returns {string[]} Array of absolute file paths
 */
function collectFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext);
    })
    .map((f) => path.join(dir, f));
}

/**
 * Formats file size in human-readable form.
 *
 * @param {number} bytes - File size in bytes
 * @returns {string} Human-readable size string
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Prints elapsed time summary.
 *
 * @param {number} elapsed - Milliseconds
 * @param {number} totalFiles - Number of files processed
 * @returns {void}
 */
function printElapsed(elapsed, totalFiles) {
  const timeStr = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(2)}s`;
  if (totalFiles > 1) {
    console.log(`\nFinished processing ${totalFiles} files in ${timeStr}`);
  } else {
    console.log(`\nFinished in ${timeStr}`);
  }
}

/**
 * Handles the "convert" subcommand — single-file conversion.
 *
 * Usage: oasis-odata-openapi convert [FLAGS]... INPUT_FILE [OUTPUT_FILE]
 *
 * @param {string[]} args - Remaining args after the subcommand
 * @returns {void}
 */
async function cmdConvert(args) {
  const { flags, positionalArgs } = parseFlags(args, {
    "output-file": { short: "o", type: "string" },
    verbose: { short: "V", type: "boolean" },
    help: { short: "h", type: "boolean" },
  });

  if (flags.help) {
    showConvertHelp();
    process.exit(EXIT_CODE.SUCCESS);
  }

  if (positionalArgs.length === 0) {
    console.error("Error: INPUT_FILE is required.");
    showConvertHelp();
    process.exit(EXIT_CODE.ERROR);
  }

  const inputPath = path.resolve(positionalArgs[0]);

  // Determine output path: flag > positional arg > auto-generate
  let outputPath;
  if (flags["output-file"]) {
    outputPath = path.resolve(flags["output-file"]);
  } else if (positionalArgs.length >= 2) {
    outputPath = path.resolve(positionalArgs[1]);
  } else {
    // Auto-generate: input.xml → input-openapi.json
    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, path.extname(inputPath));
    outputPath = path.join(dir, `${base}-openapi.json`);
  }

  // Validate input exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    await emitTrace({ ok: 0, fail: 0, skipped: [positionalArgs[0]], skipReason: "FILE_NOT_FOUND", ms: 0 });
    process.exit(EXIT_CODE.ERROR);
  }

  if (!fs.statSync(inputPath).isFile()) {
    console.error(`Error: Input path is not a file: ${inputPath}`);
    console.error('Hint: Use "oasis-odata-openapi batch" to convert directories.');
    await emitTrace({ ok: 0, fail: 0, skipped: [positionalArgs[0]], skipReason: "NOT_A_FILE", ms: 0 });
    process.exit(EXIT_CODE.ERROR);
  }

  const verbose = flags.verbose || false;
  const log = verbose ? console.log : () => {};
  const startTime = Date.now();

  try {
    console.log(`Reading: ${path.basename(inputPath)}`);
    console.log("Converting...");

    const { outputPath: out, warnings } = convertFile(inputPath, outputPath, {}, log);

    if (warnings && warnings.length > 0) {
      console.log(`\n\u26a0 ${warnings.length} warning(s):`);
      warnings.forEach((w) => console.log(`  - ${w}`));
      console.log(`\n\u2139 ${SDK_WARNING_NOTE}`);
    }

    console.log("\u2713 Conversion completed successfully!");
    console.log(`Output: ${out}`);

    const elapsed = Date.now() - startTime;
    await emitTrace({ ok: 1, fail: 0, errors: null, ms: elapsed });
    printElapsed(elapsed, 1);
  } catch (error) {
    console.error("\u2717 Conversion failed:");
    console.error(`  ${error.message}`);

    const elapsed = Date.now() - startTime;
    const fname = path.basename(inputPath);
    if (error.code === "UNSUPPORTED_EXTENSION") {
      await emitTrace({ ok: 0, fail: 0, skipped: [fname], skipReason: "UNSUPPORTED_EXTENSION", ms: elapsed });
    } else {
      await emitTrace({ ok: 0, fail: 1, errors: [{ message: error.message, code: error.code, file: fname }], ms: elapsed });
    }
    printElapsed(elapsed, 1);
    process.exit(EXIT_CODE.ERROR);
  }
}

/**
 * Handles the "batch" subcommand — multi-directory batch conversion.
 *
 * The command accepts multiple directories as input. Each supported file
 * found in the input directories is converted and saved to the target
 * directory. By default, output files are written alongside the input
 * files with a "-openapi.json" suffix.
 *
 * Usage: oasis-odata-openapi batch [FLAGS]... INPUT_DIR...
 *
 * Flags:
 *   -t, --target-dir   Output directory for converted files
 *   -r, --recursive    Search for OData files in subdirectories
 *   -O, --overwrite    Overwrite existing output files
 *   -V, --verbose      Show detailed conversion logs
 *
 * @param {string[]} args - Remaining args after the subcommand
 * @returns {void}
 */
async function cmdBatch(args) {
  const { flags, positionalArgs } = parseFlags(args, {
    "target-dir": { short: "t", type: "string" },
    recursive: { short: "r", type: "boolean" },
    overwrite: { short: "O", type: "boolean" },
    verbose: { short: "V", type: "boolean" },
    help: { short: "h", type: "boolean" },
  });

  if (flags.help) {
    showBatchHelp();
    process.exit(EXIT_CODE.SUCCESS);
  }

  if (positionalArgs.length === 0) {
    console.error("Error: At least one INPUT_DIR is required.");
    showBatchHelp();
    process.exit(EXIT_CODE.ERROR);
  }

  const recursive = flags.recursive || false;
  const overwrite = flags.overwrite || false;
  const verbose = flags.verbose || false;
  const log = verbose ? console.log : () => {};
  const targetDir = flags["target-dir"] ? path.resolve(flags["target-dir"]) : null;

  // Validate all input directories exist
  const inputDirs = positionalArgs.map((p) => path.resolve(p));
  for (const dir of inputDirs) {
    if (!fs.existsSync(dir)) {
      console.error(`Error: Input directory not found: ${dir}`);
      await emitTrace({ ok: 0, fail: 0, skipped: [dir], skipReason: "DIR_NOT_FOUND", ms: 0 });
      process.exit(EXIT_CODE.ERROR);
    }
    if (!fs.statSync(dir).isDirectory()) {
      console.error(`Error: Not a directory: ${dir}`);
      console.error('Hint: Use "oasis-odata-openapi convert" to convert a single file.');
      await emitTrace({ ok: 0, fail: 0, skipped: [dir], skipReason: "NOT_A_DIR", ms: 0 });
      process.exit(EXIT_CODE.ERROR);
    }
  }

  const startTime = Date.now();

  // Collect all files from all input directories
  const allFiles = [];
  for (const dir of inputDirs) {
    const files = recursive ? collectFilesRecursive(dir) : collectFiles(dir);
    for (const f of files) {
      allFiles.push({ inputPath: f, sourceDir: dir });
    }
  }

  if (allFiles.length === 0) {
    console.log("No supported OData files found in the specified directories.");
    console.log(`Supported extensions: ${SUPPORTED_EXTENSIONS.join(", ")}`);
    await emitTrace({ ok: 0, fail: 1, errors: [{ message: "No supported files found", code: "NO_FILES_FOUND" }], ms: Date.now() - startTime });
    process.exit(EXIT_CODE.ERROR);
  }

  console.log(`Found ${allFiles.length} supported file(s) in ${inputDirs.length} director${inputDirs.length === 1 ? "y" : "ies"}.`);
  if (recursive) {
    console.log("  (recursive search enabled)");
  }
  if (targetDir) {
    console.log(`Output directory: ${targetDir}`);
  }
  console.log();

  let okCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const errors = [];

  for (let i = 0; i < allFiles.length; i++) {
    const { inputPath, sourceDir } = allFiles[i];
    const relativeFile = path.relative(sourceDir, inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));

    // Determine output path
    let outputPath;
    if (targetDir) {
      // Preserve relative directory structure inside target dir
      const relDir = path.relative(sourceDir, path.dirname(inputPath));
      outputPath = path.join(targetDir, relDir, `${baseName}-openapi.json`);
    } else {
      // Save alongside input file
      outputPath = path.join(path.dirname(inputPath), `${baseName}-openapi.json`);
    }

    // Skip if output exists and --overwrite is not set
    if (!overwrite && fs.existsSync(outputPath)) {
      skipCount++;
      console.log(`  [${i + 1}/${allFiles.length}] \u23ed ${relativeFile} (output exists, use -O to overwrite)`);
      continue;
    }

    try {
      const { warnings } = convertFile(inputPath, outputPath, {}, log);
      okCount++;

      const warn = warnings && warnings.length > 0
        ? ` (\u26a0 ${warnings.length} warning${warnings.length !== 1 ? "s" : ""})`
        : "";
      console.log(`  [${i + 1}/${allFiles.length}] \u2713 ${relativeFile}${warn}`);

      if (warnings && warnings.length > 0) {
        warnings.forEach((w) => console.log(`           - ${w}`));
      }
    } catch (error) {
      failCount++;
      errors.push({ message: error.message, code: error.code, file: relativeFile });
      console.log(`  [${i + 1}/${allFiles.length}] \u2717 ${relativeFile} \u2014 ${error.message}`);
    }
  }

  // Summary
  const total = okCount + failCount;
  console.log(`\n${SEPARATOR}`);
  console.log("Summary:");
  console.log(`  Total files:  ${allFiles.length}`);
  console.log(`  Converted:    ${okCount}`);
  console.log(`  Failed:       ${failCount}`);
  if (skipCount > 0) {
    console.log(`  Skipped:      ${skipCount}`);
  }

  // Show SDK warning note once if any conversion had warnings
  if (okCount > 0) {
    console.log(`\n\u2139 ${SDK_WARNING_NOTE}`);
  }
  console.log(SEPARATOR);

  const elapsed = Date.now() - startTime;
  await emitTrace({ ok: okCount, fail: failCount, errors: errors.length > 0 ? errors : null, ms: elapsed });
  printElapsed(elapsed, total);

  if (failCount > 0) {
    process.exit(EXIT_CODE.ERROR);
  }
}

/**
 * Handles the "info" subcommand — displays OData CSDL file metadata.
 *
 * Outputs file information including path, size, format, OData version,
 * namespace, entity types, complex types, entity sets, and function
 * imports. Also does basic validation.
 *
 * Usage: oasis-odata-openapi info [FLAGS]... INPUT_FILE
 *
 * @param {string[]} args - Remaining args after the subcommand
 * @returns {void}
 */
async function cmdInfo(args) {
  const { flags, positionalArgs } = parseFlags(args, {
    help: { short: "h", type: "boolean" },
  });

  if (flags.help) {
    showInfoHelp();
    process.exit(EXIT_CODE.SUCCESS);
  }

  if (positionalArgs.length === 0) {
    console.error("Error: INPUT_FILE is required.");
    showInfoHelp();
    process.exit(EXIT_CODE.ERROR);
  }

  const inputPath = path.resolve(positionalArgs[0]);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    await emitTrace({ ok: 0, fail: 0, skipped: [positionalArgs[0]], skipReason: "FILE_NOT_FOUND", ms: 0 });
    process.exit(EXIT_CODE.ERROR);
  }

  if (!fs.statSync(inputPath).isFile()) {
    console.error(`Error: Not a file: ${inputPath}`);
    await emitTrace({ ok: 0, fail: 0, skipped: [positionalArgs[0]], skipReason: "NOT_A_FILE", ms: 0 });
    process.exit(EXIT_CODE.ERROR);
  }

  const stats = fs.statSync(inputPath);
  const content = fs.readFileSync(inputPath, "utf8");

  console.log(`\n${SEPARATOR}`);
  console.log("  File Information");
  console.log(SEPARATOR);
  console.log(`  Path:             ${inputPath}`);
  console.log(`  File name:        ${path.basename(inputPath)}`);
  console.log(`  Extension:        ${path.extname(inputPath)}`);
  console.log(`  Size:             ${formatFileSize(stats.size)}`);
  console.log(`  Modified:         ${stats.mtime.toISOString()}`);

  // Detect format and extract metadata
  try {
    const format = detectFormat(content);
    console.log(`  Format:           ${format.toUpperCase()}`);

    if (format === FORMAT.XML || format === FORMAT.EDMX) {
      // Extract XML metadata
      const versionMatch = content.match(/Version="([^"]+)"/);
      if (versionMatch) {
        console.log(`  OData Version:    ${versionMatch[1]}`);
      }

      const namespaceMatch = content.match(/Namespace="([^"]+)"/);
      if (namespaceMatch) {
        console.log(`  Namespace:        ${namespaceMatch[1]}`);
      }

      // Count EntityType elements
      const entityTypes = (content.match(/<EntityType\b/g) || []).length;
      if (entityTypes > 0) {
        console.log(`  Entity Types:     ${entityTypes}`);
      }

      // Count ComplexType elements
      const complexTypes = (content.match(/<ComplexType\b/g) || []).length;
      if (complexTypes > 0) {
        console.log(`  Complex Types:    ${complexTypes}`);
      }

      // Count EntitySet elements
      const entitySets = (content.match(/<EntitySet\b/g) || []).length;
      if (entitySets > 0) {
        console.log(`  Entity Sets:      ${entitySets}`);
      }

      // Count FunctionImport elements
      const functionImports = (content.match(/<FunctionImport\b/g) || []).length;
      if (functionImports > 0) {
        console.log(`  Function Imports: ${functionImports}`);
      }
    } else {
      // JSON CSDL metadata
      try {
        const json = JSON.parse(content);
        if (json.$Version) {
          console.log(`  OData Version:    ${json.$Version}`);
        }

        // Count schemas in JSON CSDL
        const schemas = Object.keys(json).filter((k) => !k.startsWith("$"));
        if (schemas.length > 0) {
          console.log(`  Schemas:          ${schemas.length}`);
          schemas.forEach((s) => console.log(`                      - ${s}`));
        }
      } catch (_) {
        // Ignore JSON parse errors for metadata extraction
      }
    }

    console.log(`  Valid:             \u2713 Yes`);
  } catch (err) {
    console.log(`  Valid:             \u2717 No`);
    console.log(`  Error:            ${err.message}`);
    await emitTrace({ ok: 0, fail: 0, skipped: [path.basename(inputPath)], skipReason: "VALIDATION_FAILED", ms: 0 });
  }

  console.log(SEPARATOR);
  console.log();
}

/**
 * Main CLI entry point. Routes to the appropriate subcommand handler.
 *
 * @returns {void}
 */
async function main() {
  const args = process.argv.slice(2);

  // No arguments — show help
  if (args.length === 0) {
    showMainHelp();
    process.exit(EXIT_CODE.SUCCESS);
  }

  // Global --help / --version before subcommand
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

  // Route to subcommand
  switch (command) {
    case "convert":
      await cmdConvert(subArgs);
      break;

    case "batch":
      await cmdBatch(subArgs);
      break;

    case "info":
      await cmdInfo(subArgs);
      break;

    case "version":
      console.log(`v${VERSION}`);
      break;

    case "help":
      if (subArgs.length > 0 && COMMANDS.includes(subArgs[0])) {
        // Show help for a specific subcommand
        switch (subArgs[0]) {
          case "convert": showConvertHelp(); break;
          case "batch": showBatchHelp(); break;
          case "info": showInfoHelp(); break;
          default: showMainHelp(); break;
        }
      } else {
        showMainHelp();
      }
      break;

    default:
      console.error(`Error: Unknown command "${command}".`);
      console.error('Run "oasis-odata-openapi help" for usage information.');
      process.exit(EXIT_CODE.ERROR);
      break;
  }
}

main();