// +--------------------------------------------------------------
// <copyright file="batch.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview CLI "batch" command — multi-directory batch conversion.
// ---------------------------------------------------------------

const fs = require("fs");
const os = require("os");
const path = require("path");
const { convertFile, SUPPORTED_EXTENSIONS, SDK_WARNING_NOTE, EXIT_CODE } = require("../../core/index.js");
const { parseFlags } = require("../flags.js");
const { SEPARATOR, printElapsed } = require("../output.js");

/**
 * Shows help for the batch command.
 */
function showHelp() {
  console.log(`
Convert all supported OData CSDL files in one or more directories to
OpenAPI 3.0 format.

Usage:
  odata-converter batch [FLAGS]... INPUT_DIR...

Flags:
  -t, --target-dir   string  Output directory for converted files
  -s, --server-url   string  The base URL for the generated OpenAPI spec, shared across all files (e.g., https://your-sap-server.com/sap/opu/odata/sap/)
  -c, --concurrency  string  Maximum files to process in parallel (default: min(cpu count, 8))
  -A, --apply                Add the $apply (aggregation) query option to all collection endpoints
  -R, --require-top          Make $top required (default 10) to guard against unbounded reads
  -B, --include-batch        Include the /$batch path (skipped by default for security)
  -r, --recursive            Search for OData files in subdirectories
  -O, --overwrite            Overwrite existing output files
  -V, --verbose              Show detailed step-by-step conversion logs
  -h, --help                 Show this help message

Examples:
  odata-converter batch ./input
  odata-converter batch -t ./output ./input
  odata-converter batch -s https://myserver.com/sap/opu/odata/sap/ -r ./input
  odata-converter batch -t ./output -r ./input1 ./input2
`);
}

/**
 * Recursively collects all supported OData files from a directory tree.
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
 * Runs tasks with a concurrency limit while preserving result order.
 *
 * @param {Array<() => Promise<any>>} tasks - Task functions to execute.
 * @param {number} limit - Maximum number of concurrent tasks.
 * @returns {Promise<any[]>} Ordered task results.
 */
async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.allSettled(workers);
  return results;
}

/**
 * Executes the batch command.
 *
 * @param {string[]} args - Arguments after "batch"
 * @param {{ emitTrace: function }} ctx - CLI context with telemetry
 */
async function execute(args, ctx) {
  const { flags, positionalArgs } = parseFlags(args, {
    "target-dir": { short: "t", type: "string" },
    "server-url": { short: "s", type: "string" },
    concurrency: { short: "c", type: "string" },
    apply: { short: "A", type: "boolean" },
    "require-top": { short: "R", type: "boolean" },
    "include-batch": { short: "B", type: "boolean" },
    recursive: { short: "r", type: "boolean" },
    overwrite: { short: "O", type: "boolean" },
    verbose: { short: "V", type: "boolean" },
    help: { short: "h", type: "boolean" },
  });

  if (flags.help) {
    showHelp();
    process.exit(EXIT_CODE.SUCCESS);
  }

  if (positionalArgs.length === 0) {
    console.error("Error: At least one INPUT_DIR is required.");
    showHelp();
    process.exit(EXIT_CODE.ERROR);
  }

  const recursive = flags.recursive || false;
  const overwrite = flags.overwrite || false;
  const verbose = flags.verbose || false;
  const targetDir = flags["target-dir"] ? path.resolve(flags["target-dir"]) : null;

  // Parse shared server URL into csdl2openapi options
  const options = {};
  if (flags["server-url"]) {
    try {
      const url = new URL(flags["server-url"]);
      options.scheme = url.protocol.replace(":", "");
      options.host = url.host;
      options.basePath = url.pathname || "/";
    } catch {
      console.error(`Error: Invalid --server-url. Must be a valid URL (e.g., https://myserver.com/sap/opu/odata/sap/).`);
      process.exit(EXIT_CODE.ERROR);
    }
  }
  if (flags.apply) {
    options.includeApply = true;
  }
  if (flags["require-top"]) {
    options.requireTop = true;
  }
  if (flags["include-batch"]) {
    options.includeBatch = true;
  }

  const inputDirs = positionalArgs.map((p) => path.resolve(p));
  for (const dir of inputDirs) {
    if (!fs.existsSync(dir)) {
      console.error(`Error: Input directory not found: ${dir}`);
      await ctx.emitTrace({ ok: 0, fail: 0, skipped: [dir], skipReason: "DIR_NOT_FOUND", ms: 0 });
      process.exit(EXIT_CODE.ERROR);
    }
    if (!fs.statSync(dir).isDirectory()) {
      console.error(`Error: Not a directory: ${dir}`);
      console.error('Hint: Use "odata-converter convert" to convert a single file.');
      await ctx.emitTrace({ ok: 0, fail: 0, skipped: [dir], skipReason: "NOT_A_DIR", ms: 0 });
      process.exit(EXIT_CODE.ERROR);
    }
  }

  const startTime = Date.now();

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
    await ctx.emitTrace({ ok: 0, fail: 1, errors: [{ message: "No supported files found", code: "NO_FILES_FOUND" }], ms: Date.now() - startTime });
    process.exit(EXIT_CODE.ERROR);
  }

  const defaultConcurrency = Math.min(os.cpus().length, 8);
  const parsedConcurrency = parseInt(flags.concurrency, 10);
  const concurrency = Math.max(
    1,
    Math.min(Number.isInteger(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : defaultConcurrency, allFiles.length || 1),
  );

  console.log(`Found ${allFiles.length} supported file(s) in ${inputDirs.length} director${inputDirs.length === 1 ? "y" : "ies"}.`);
  if (recursive) console.log("  (recursive search enabled)");
  if (targetDir) console.log(`Output directory: ${targetDir}`);
  console.log(`Processing with concurrency: ${concurrency}`);
  console.log();

  const tasks = allFiles.map(({ inputPath, sourceDir }, i) => async () => {
    const relativeFile = path.relative(sourceDir, inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const logs = [];
    const taskLog = verbose ? (message) => logs.push(message) : () => {};

    let outputPath;
    if (targetDir) {
      const relDir = path.relative(sourceDir, path.dirname(inputPath));
      outputPath = path.join(targetDir, relDir, `${baseName}-openapi.json`);
    } else {
      outputPath = path.join(path.dirname(inputPath), `${baseName}-openapi.json`);
    }

    if (!overwrite && fs.existsSync(outputPath)) {
      return { index: i, status: "skipped", relativeFile, logs };
    }

    try {
      const { warnings } = convertFile(inputPath, outputPath, options, taskLog);
      return { index: i, status: "ok", relativeFile, warnings, logs };
    } catch (error) {
      return { index: i, status: "fail", relativeFile, error, logs };
    }
  });

  const results = await runWithConcurrency(tasks, concurrency);

  let okCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const errors = [];

  for (const result of results) {
    const num = `[${result.index + 1}/${allFiles.length}]`;

    if (result.logs && result.logs.length > 0) {
      result.logs.forEach((message) => console.log(message));
    }

    if (result.status === "skipped") {
      skipCount++;
      console.log(`  ${num} ⏭ ${result.relativeFile} (output exists, use -O to overwrite)`);
      continue;
    }

    if (result.status === "ok") {
      okCount++;
      const warn = result.warnings && result.warnings.length > 0
        ? ` (⚠ ${result.warnings.length} warning${result.warnings.length !== 1 ? "s" : ""})`
        : "";
      console.log(`  ${num} ✓ ${result.relativeFile}${warn}`);

      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach((warning) => console.log(`           - ${warning}`));
      }
      continue;
    }

    failCount++;
    errors.push({ message: result.error.message, code: result.error.code, file: result.relativeFile });
    console.log(`  ${num} ✗ ${result.relativeFile}: ${result.error.message}`);
  }

  const total = okCount + failCount;
  console.log(`\n${SEPARATOR}`);
  console.log("Summary:");
  console.log(`  Total files:  ${allFiles.length}`);
  console.log(`  Converted:    ${okCount}`);
  console.log(`  Failed:       ${failCount}`);
  if (skipCount > 0) console.log(`  Skipped:      ${skipCount}`);

  if (okCount > 0) {
    console.log(`\n\u2139 ${SDK_WARNING_NOTE}`);
  }
  console.log(SEPARATOR);

  const elapsed = Date.now() - startTime;
  await ctx.emitTrace({ ok: okCount, fail: failCount, errors: errors.length > 0 ? errors : null, ms: elapsed });
  printElapsed(elapsed, total);

  if (failCount > 0) process.exit(EXIT_CODE.ERROR);
}

module.exports = { execute, showHelp };
