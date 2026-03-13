// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for api/lib/helper.js
 * Covers: postProcess (pipeline entry point, including addPutMethods behaviour)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { postProcess } = require("../../api/lib/helper.js");

// ── postProcess (pipeline entry point) ───────────────────────

describe("postProcess", () => {
  it("should apply addPutMethods via the pipeline", () => {
    const spec = {
      paths: {
        "/a": { patch: { summary: "Patch A" } },
        "/b": { get: { summary: "Get B" } },
      },
    };

    const result = postProcess(spec);
    assert.ok(result.paths["/a"].put, "PUT should be added for /a");
    assert.equal(result.paths["/b"].put, undefined, "No PUT for /b (no PATCH)");
  });

  it("should accept and parse a JSON string", () => {
    const json = JSON.stringify({
      paths: { "/x": { patch: { summary: "X" } } },
    });
    const result = postProcess(json);
    assert.ok(result.paths["/x"].put);
  });

  it("should throw on null input", () => {
    assert.throws(
      () => postProcess(null),
      (err) => err.message.includes("null")
    );
  });

  it("should throw on undefined input", () => {
    assert.throws(
      () => postProcess(undefined),
      (err) => err.message.includes("null or undefined")
    );
  });

  it("should throw on array input", () => {
    assert.throws(
      () => postProcess([1, 2]),
      (err) => err.message.includes("Expected an OpenAPI object")
    );
  });

  it("should throw on invalid JSON string", () => {
    assert.throws(
      () => postProcess("{bad}"),
      (err) => err.message.includes("Failed to parse")
    );
  });

  it("should throw on numeric input", () => {
    assert.throws(
      () => postProcess(42),
      (err) => err.message.includes("Expected an OpenAPI object")
    );
  });
});

// ── addPutMethods behaviour (tested via postProcess) ─────────

describe("postProcess — addPutMethods behaviour", () => {
  it("should add PUT for every PATCH endpoint", () => {
    const spec = {
      openapi: "3.0.0",
      paths: {
        "/items/{id}": {
          patch: { summary: "Update item", responses: { "200": {} } },
        },
        "/orders/{id}": {
          patch: { summary: "Update order", responses: { "204": {} } },
        },
      },
    };

    const result = postProcess(spec);

    assert.ok(result.paths["/items/{id}"].put, "PUT should be added to /items/{id}");
    assert.ok(result.paths["/orders/{id}"].put, "PUT should be added to /orders/{id}");
  });

  it("should not overwrite an existing PUT operation", () => {
    const spec = {
      paths: {
        "/items/{id}": {
          patch: { summary: "Patch item" },
          put: { summary: "Existing PUT" },
        },
      },
    };

    const result = postProcess(spec);
    assert.equal(result.paths["/items/{id}"].put.summary, "Existing PUT");
  });

  it("should deep-copy PATCH to PUT (independent objects)", () => {
    const spec = {
      paths: {
        "/a": {
          patch: { summary: "Patch", nested: { key: "original" } },
        },
      },
    };

    const result = postProcess(spec);

    // Mutate the original PATCH — PUT should not be affected
    result.paths["/a"].patch.nested.key = "modified";
    assert.equal(result.paths["/a"].put.nested.key, "original");
  });

  it("should leave paths without PATCH untouched", () => {
    const spec = {
      paths: {
        "/items": {
          get: { summary: "List items" },
          post: { summary: "Create item" },
        },
      },
    };

    const result = postProcess(spec);
    assert.equal(result.paths["/items"].put, undefined);
    assert.ok(result.paths["/items"].get);
    assert.ok(result.paths["/items"].post);
  });

  it("should handle spec with no paths property", () => {
    const spec = { openapi: "3.0.0", info: { title: "Test" } };
    const result = postProcess(spec);
    assert.deepEqual(result, spec);
  });

  it("should handle empty paths object", () => {
    const spec = { openapi: "3.0.0", paths: {} };
    const result = postProcess(spec);
    assert.deepEqual(result.paths, {});
  });

  it("should skip null path entries", () => {
    const spec = {
      paths: {
        "/ok": { patch: { summary: "OK" } },
        "/null-entry": null,
      },
    };

    const result = postProcess(spec);
    assert.ok(result.paths["/ok"].put);
    assert.equal(result.paths["/null-entry"], null);
  });

  it("should skip non-object path entries", () => {
    const spec = {
      paths: {
        "/ok": { patch: { summary: "OK" } },
        "/bad": "string-value",
      },
    };

    const result = postProcess(spec);
    assert.ok(result.paths["/ok"].put);
  });

  it("should handle multiple paths with mixed PATCH/non-PATCH", () => {
    const spec = {
      paths: {
        "/a": { get: {} },
        "/b": { patch: { summary: "B" } },
        "/c": { post: {}, delete: {} },
        "/d": { patch: { summary: "D" }, put: { summary: "D-existing" } },
        "/e": { patch: { summary: "E" } },
      },
    };

    const result = postProcess(spec);

    assert.equal(result.paths["/a"].put, undefined);
    assert.ok(result.paths["/b"].put);
    assert.equal(result.paths["/c"].put, undefined);
    assert.equal(result.paths["/d"].put.summary, "D-existing"); // not overwritten
    assert.ok(result.paths["/e"].put);
  });
});
