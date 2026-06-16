// +--------------------------------------------------------------
// <copyright file="info.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview CLI "info" command — display OData CSDL file metadata.
// ---------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { detectFormat, FORMAT, EXIT_CODE } = require("../../core/index.js");
const { parseFlags } = require("../flags.js");
const { SEPARATOR, formatFileSize } = require("../output.js");

/**
 * Shows help for the info command.
 */
function showHelp() {
  console.log(`
Display information about an OData CSDL file.

Usage:
  odata-converter info [FLAGS]... INPUT_FILE

Flags:
  -h, --help   Show this help message

Examples:
  odata-converter info service.xml
  odata-converter info metadata.edmx
  odata-converter info csdl-schema.json
`);
}

/**
 * Executes the info command.
 *
 * @param {string[]} args - Arguments after "info"
 * @param {{ emitTrace: function }} ctx - CLI context with telemetry
 */
async function execute(args, ctx) {
  const { flags, positionalArgs } = parseFlags(args, {
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

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    await ctx.emitTrace({ ok: 0, fail: 0, skipped: [positionalArgs[0]], skipReason: "FILE_NOT_FOUND", ms: 0 });
    process.exit(EXIT_CODE.ERROR);
  }

  if (!fs.statSync(inputPath).isFile()) {
    console.error(`Error: Not a file: ${inputPath}`);
    await ctx.emitTrace({ ok: 0, fail: 0, skipped: [positionalArgs[0]], skipReason: "NOT_A_FILE", ms: 0 });
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

  try {
    const format = detectFormat(content);
    console.log(`  Format:           ${format.toUpperCase()}`);

    if (format === FORMAT.XML || format === FORMAT.EDMX) {
      const versionMatch = content.match(/Version="([^"]+)"/);
      if (versionMatch) console.log(`  OData Version:    ${versionMatch[1]}`);

      const namespaceMatch = content.match(/Namespace="([^"]+)"/);
      if (namespaceMatch) console.log(`  Namespace:        ${namespaceMatch[1]}`);

      const entityTypes = (content.match(/<EntityType\b/g) || []).length;
      if (entityTypes > 0) console.log(`  Entity Types:     ${entityTypes}`);

      const complexTypes = (content.match(/<ComplexType\b/g) || []).length;
      if (complexTypes > 0) console.log(`  Complex Types:    ${complexTypes}`);

      const entitySets = (content.match(/<EntitySet\b/g) || []).length;
      if (entitySets > 0) console.log(`  Entity Sets:      ${entitySets}`);

      const functionImports = (content.match(/<FunctionImport\b/g) || []).length;
      if (functionImports > 0) console.log(`  Function Imports: ${functionImports}`);
    } else {
      try {
        const json = JSON.parse(content);
        if (json.$Version) console.log(`  OData Version:    ${json.$Version}`);

        const schemas = Object.keys(json).filter((k) => !k.startsWith("$"));
        if (schemas.length > 0) {
          console.log(`  Schemas:          ${schemas.length}`);
          schemas.forEach((s) => console.log(`                      - ${s}`));
        }
      } catch {
        // Ignore JSON parse errors for metadata extraction
      }
    }

    console.log(`  Valid:             \u2713 Yes`);
  } catch (err) {
    console.log(`  Valid:             \u2717 No`);
    console.log(`  Error:            ${err.message}`);
    await ctx.emitTrace({ ok: 0, fail: 0, skipped: [path.basename(inputPath)], skipReason: "VALIDATION_FAILED", ms: 0 });
  }

  console.log(SEPARATOR);
  console.log();
}

module.exports = { execute, showHelp };
