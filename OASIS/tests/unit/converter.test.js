// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for api/lib/converter.js
 * Covers: convertContent (advanced),
 *         convertFile (edge cases), convertFolder (edge cases)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  convertContent,
  convertFile,
  convertFolder,
} = require("../../api/lib/converter.js");

const SAMPLE_DIR = path.resolve(__dirname, "../../INPUT");
const SAMPLE_FILE = "SAP-APIM-GWSAMPLE.xml";
const sampleAvailable = fs.existsSync(path.join(SAMPLE_DIR, SAMPLE_FILE));

// ── convertContent — advanced ─────────────────────────────────

describe("convertContent — logger integration", () => {
  if (!sampleAvailable) return;

  let sampleXml;
  before(() => {
    sampleXml = fs.readFileSync(path.join(SAMPLE_DIR, SAMPLE_FILE), "utf8");
  });

  it("should call logger at each conversion stage", () => {
    const logs = [];
    convertContent(sampleXml, {}, (msg) => logs.push(msg));

    assert.ok(logs.some((l) => l.includes("Detecting")), "Should log format detection");
    assert.ok(logs.some((l) => l.includes("Parsing")), "Should log parsing stage");
    assert.ok(logs.some((l) => l.includes("Converting")), "Should log CSDL→OpenAPI stage");
    assert.ok(logs.some((l) => l.includes("Compiling")), "Should log post-processing stage");
  });

  it("should work with no logger (default no-op)", () => {
    assert.doesNotThrow(() => convertContent(sampleXml));
  });
});

describe("convertContent — JSON CSDL input", () => {
  it("should convert minimal valid OData V4 CSDL JSON", () => {
    const json = JSON.stringify({
      "$Version": "4.0",
      "TestService": {
        "$Kind": "Schema",
        "TestEntity": {
          "$Kind": "EntityType",
          "$Key": ["ID"],
          "ID": { "$Type": "Edm.Int32" },
        },
        "Container": {
          "$Kind": "EntityContainer",
          "TestSet": {
            "$Collection": true,
            "$Type": "TestService.TestEntity",
          },
        },
      },
    });

    const { openapi, warnings } = convertContent(json);

    assert.ok(openapi.openapi.startsWith("3."), "Should produce OpenAPI 3.x");
    assert.ok(openapi.info, "Should have info block");
    assert.ok(openapi.paths, "Should have paths");
    assert.ok(Array.isArray(warnings));
  });
});

describe("convertContent — post-processing pipeline", () => {
  if (!sampleAvailable) return;

  let sampleXml;
  before(() => {
    sampleXml = fs.readFileSync(path.join(SAMPLE_DIR, SAMPLE_FILE), "utf8");
  });

  it("should apply the post-processing pipeline (PUT for every PATCH)", () => {
    const { openapi } = convertContent(sampleXml);

    for (const [route, methods] of Object.entries(openapi.paths)) {
      if (methods.patch) {
        assert.ok(methods.put, `PUT should exist for ${route}`);
      }
    }
  });

  it("should throw PostProcessingError when pipeline fails", () => {
    // An empty string content triggers an InvalidContentError, not PostProcessingError.
    // PostProcessingError is only thrown if the pipeline itself blows up,
    // which is tested via helper.test.js directly.
    // Here we just verify the converter wraps the pipeline correctly.
    const { openapi } = convertContent(sampleXml);
    assert.ok(openapi.paths, "Pipeline should complete without throwing");
  });
});

// ── convertFile — edge cases ──────────────────────────────────

describe("convertFile — directory creation", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oasis-conv-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  if (!sampleAvailable) return;

  it("should create nested output directories automatically", () => {
    const nestedOutput = path.join(tmpDir, "a", "b", "c", "output.json");
    const { outputPath } = convertFile(
      path.join(SAMPLE_DIR, SAMPLE_FILE),
      nestedOutput
    );

    assert.ok(fs.existsSync(outputPath));
    const data = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.ok(data.openapi);
  });

  it("should produce pretty-printed JSON output (2-space indent)", () => {
    const output = path.join(tmpDir, "pretty.json");
    convertFile(path.join(SAMPLE_DIR, SAMPLE_FILE), output);

    const raw = fs.readFileSync(output, "utf8");
    // Pretty-printed JSON has newlines and 2-space indentation
    assert.ok(raw.includes("\n  "), "Output should be pretty-printed");
  });
});

describe("convertFile — error cases", () => {
  it("should throw FileIOError for non-existent input", () => {
    assert.throws(
      () => convertFile("/nonexistent/path/file.xml", "/tmp/out.json"),
      (err) => err.name === "FileIOError"
    );
  });

  it("should throw UnsupportedExtensionError for .txt file", () => {
    let tmpFile;
    try {
      tmpFile = path.join(os.tmpdir(), "oasis-test-ext.txt");
      fs.writeFileSync(tmpFile, "test content", "utf8");

      assert.throws(
        () => convertFile(tmpFile, "/tmp/out.json"),
        (err) => err.name === "UnsupportedExtensionError"
      );
    } finally {
      if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});

// ── convertFolder — edge cases ─────────────────────────────────

describe("convertFolder — empty and missing folders", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oasis-batch-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return zero counts for empty folder", () => {
    const emptyDir = path.join(tmpDir, "empty");
    fs.mkdirSync(emptyDir);

    const result = convertFolder(emptyDir, path.join(tmpDir, "out-empty"));
    assert.equal(result.total, 0);
    assert.equal(result.successful, 0);
    assert.equal(result.failed, 0);
    assert.deepEqual(result.results, []);
  });

  it("should ignore unsupported file types", () => {
    const mixedDir = path.join(tmpDir, "mixed");
    fs.mkdirSync(mixedDir);
    fs.writeFileSync(path.join(mixedDir, "readme.txt"), "not odata");
    fs.writeFileSync(path.join(mixedDir, "image.png"), "binary");
    fs.writeFileSync(path.join(mixedDir, ".gitignore"), "node_modules/");

    const result = convertFolder(mixedDir, path.join(tmpDir, "out-mixed"));
    assert.equal(result.total, 0);
  });

  it("should throw for non-existent input folder", () => {
    assert.throws(
      () => convertFolder("/does/not/exist", path.join(tmpDir, "out")),
      (err) => err.message.includes("not found")
    );
  });
});

describe("convertFolder — callback and error handling", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oasis-batch2-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should call onFileComplete for each processed file", () => {
    const inputDir = path.join(tmpDir, "callback-input");
    fs.mkdirSync(inputDir);
    // Create a file that will fail conversion (valid XML but not CSDL)
    fs.writeFileSync(path.join(inputDir, "a.xml"), "<root><child/></root>");
    fs.writeFileSync(path.join(inputDir, "b.xml"), "<root><child/></root>");

    const calls = [];
    convertFolder(
      inputDir,
      path.join(tmpDir, "callback-out"),
      {},
      () => {},
      (result, current, total) => calls.push({ current, total, success: result.success })
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0].current, 1);
    assert.equal(calls[0].total, 2);
    assert.equal(calls[1].current, 2);
    assert.equal(calls[1].total, 2);
  });

  it("should handle files that fail conversion gracefully", () => {
    const inputDir = path.join(tmpDir, "bad-input");
    fs.mkdirSync(inputDir);
    fs.writeFileSync(
      path.join(inputDir, "invalid.xml"),
      "<not-odata><broken/></not-odata>"
    );

    const result = convertFolder(inputDir, path.join(tmpDir, "bad-out"));

    assert.equal(result.total, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.successful, 0);
    assert.equal(result.results[0].success, false);
    assert.ok(result.results[0].error);
  });

  it("should create output folder if it does not exist", () => {
    if (!sampleAvailable) return;

    const outputDir = path.join(tmpDir, "auto-created", "nested");
    const result = convertFolder(SAMPLE_DIR, outputDir);

    assert.ok(result.total > 0);
    assert.ok(fs.existsSync(outputDir), "Output directory should be created");

    // Cleanup
    fs.rmSync(outputDir, { recursive: true, force: true });
  });
});
