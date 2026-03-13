// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * End-to-end regression tests using the reference test data.
 *
 * Converts every OData input file from ../test/odatav2, ../test/odatav3,
 * and ../test/odatav4, then validates the output.
 *
 * What is verified for each test case:
 *   1. Conversion succeeds without throwing
 *   2. Output is a valid OpenAPI 3.x object
 *   3. PUT exists for every PATCH endpoint (post-processing)
 */

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { convertContent } = require("../../api/lib/converter.js");

const TEST_DATA_ROOT = path.resolve(__dirname, "../../../test");

/**
 * Maps input files to their OData version label.
 * Paths are relative to TEST_DATA_ROOT.
 */
const TEST_CASES = [
  { input: "odatav2/OP_API_BUSINESS_PARTNER_SRV.edmx", label: "OData V2 — Business Partner" },
  { input: "odatav2/OP_API_PRODUCT_SRV_0001.edmx", label: "OData V2 — Product" },
  { input: "odatav2/OP_API_PURCHASEORDER_PROCESS_SRV_0001.edmx", label: "OData V2 — Purchase Order" },
  { input: "odatav2/OP_API_SALES_ORDER_SRV_0001.edmx", label: "OData V2 — Sales Order" },
  { input: "odatav3/SAPBusinessOne-Metadata.xml", label: "OData V3 — SAP Business One" },
  { input: "odatav4/MDataService.edmx", label: "OData V4 — MDataService" },
  { input: "odatav4/OP_PRODUCT_0002.edmx", label: "OData V4 — Product V2" },
  { input: "odatav4/OP_PURCHASEORDER_0001.edmx", label: "OData V4 — Purchase Order V1" },
];

// ── Test helpers ───────────────────────────────────────────────

function loadFile(relativePath) {
  const full = path.join(TEST_DATA_ROOT, relativePath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}



// ── Regression suite ───────────────────────────────────────────

describe("E2E regression — reference test data", () => {
  // Skip the entire suite if test data directory is missing
  if (!fs.existsSync(TEST_DATA_ROOT)) {
    it("SKIP: test data directory not found", () => {
      assert.ok(true, `Skipped — ${TEST_DATA_ROOT} not found`);
    });
    return;
  }

  for (const tc of TEST_CASES) {
    describe(tc.label, () => {
      const inputContent = loadFile(tc.input);

      if (!inputContent) {
        it(`SKIP: input not found (${tc.input})`, () => assert.ok(true));
        return;
      }

      if (tc.knownSdkFailure) {
        it("should throw OpenApiConversionError (known SDK limitation)", () => {
          assert.throws(
            () => convertContent(inputContent),
            (err) => err.name === "OpenApiConversionError"
          );
        });
        return; // skip remaining assertions — conversion does not produce output
      }

      it("should convert without throwing", () => {
        assert.doesNotThrow(() => convertContent(inputContent));
      });

      it("should produce valid OpenAPI 3.x output", () => {
        const { openapi } = convertContent(inputContent);

        assert.ok(openapi.openapi, "Missing 'openapi' version field");
        assert.ok(openapi.openapi.startsWith("3."), `Expected 3.x, got ${openapi.openapi}`);
        assert.ok(openapi.info, "Missing 'info' block");
        assert.ok(openapi.info.title, "Missing 'info.title'");
        assert.ok(openapi.paths, "Missing 'paths'");
      });

      it("should add PUT for every PATCH endpoint", () => {
        const { openapi } = convertContent(inputContent);

        for (const [route, methods] of Object.entries(openapi.paths)) {
          if (methods.patch) {
            assert.ok(
              methods.put,
              `PUT missing for PATCH endpoint: ${route}`
            );
          }
        }
      });


    });
  }
});

// ── Additional E2E: batch conversion of all INPUT samples ─────

describe("E2E — INPUT sample files", () => {
  const INPUT_DIR = path.resolve(__dirname, "../../INPUT");
  if (!fs.existsSync(INPUT_DIR)) return;

  const supportedRe = /\.(xml|edmx|json)$/i;
  const files = fs.readdirSync(INPUT_DIR).filter((f) => supportedRe.test(f));

  // Files with known SDK conversion failures (bugs in odata-openapi)
  const KNOWN_SDK_FAILURES = new Set(["PLTUserManagement.edmx"]);

  for (const file of files) {
    if (KNOWN_SDK_FAILURES.has(file)) {
      it(`should throw OpenApiConversionError for INPUT/${file} (known SDK limitation)`, () => {
        const content = fs.readFileSync(path.join(INPUT_DIR, file), "utf8");
        assert.throws(
          () => convertContent(content),
          (err) => err.name === "OpenApiConversionError"
        );
      });
      continue;
    }

    it(`should convert INPUT/${file} without throwing`, () => {
      const content = fs.readFileSync(path.join(INPUT_DIR, file), "utf8");
      const { openapi } = convertContent(content);

      assert.ok(openapi.openapi, `${file}: missing openapi version`);
      assert.ok(openapi.paths, `${file}: missing paths`);
    });
  }
});
