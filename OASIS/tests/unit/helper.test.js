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

  it("should handle empty paths object (GET+HEAD added at root and metadata)", () => {
    const spec = { openapi: "3.0.0", paths: {} };
    const result = postProcess(spec);
    // addHeadMethods creates root "/" and "/$metadata" with GET+HEAD
    assert.equal(result.paths["/"].head.operationId, "root/head");
    assert.equal(result.paths["/"].get.operationId, "root/get");
    assert.equal(result.paths["/$metadata"].get.operationId, "metadata/get");
    assert.equal(result.paths["/$metadata"].head.operationId, "metadata/head");
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

// ── addHeadMethods behaviour (tested via postProcess) ────────

describe("postProcess — addHeadMethods behaviour", () => {
  it("should add GET and HEAD to root '/' path", () => {
    const spec = {
      paths: {
        "/items": { get: { summary: "List" } },
      },
    };

    const result = postProcess(spec);

    assert.ok(result.paths["/"].get, "GET should be added to root /");
    assert.equal(result.paths["/"].get.operationId, "root/get");
    assert.ok(result.paths["/"].head, "HEAD should be added to root /");
    assert.equal(result.paths["/"].head.operationId, "root/head");
    assert.ok(
      result.paths["/"].head.summary.includes("csrf"),
      "Summary should mention csrf"
    );
    assert.ok(result.paths["/"].head.responses["200"]);
  });

  it("should create root '/' path with GET and HEAD if it does not exist", () => {
    const spec = {
      paths: {
        "/items": { get: { summary: "List items" } },
      },
    };

    const result = postProcess(spec);

    assert.ok(result.paths["/"], "Root / path should be created");
    assert.ok(result.paths["/"].get, "GET should be added to created root /");
    assert.ok(result.paths["/"].head, "HEAD should be added to created root /");
    assert.equal(result.paths["/"].head.operationId, "root/head");
    assert.equal(result.paths["/"].get.operationId, "root/get");
  });

  it("should always create '/$metadata' with GET and HEAD", () => {
    const spec = {
      paths: {
        "/items": { get: { summary: "List" } },
      },
    };

    const result = postProcess(spec);

    assert.ok(result.paths["/$metadata"], "/$metadata path should be created");
    assert.ok(result.paths["/$metadata"].get, "GET should be added");
    assert.equal(result.paths["/$metadata"].get.operationId, "metadata/get");
    assert.ok(result.paths["/$metadata"].head, "HEAD should be added");
    assert.equal(result.paths["/$metadata"].head.operationId, "metadata/head");
    assert.ok(result.paths["/$metadata"].head.responses["200"]);
  });

  it("should not overwrite existing GET on '/$metadata'", () => {
    const spec = {
      paths: {
        "/$metadata": { get: { summary: "Custom metadata GET" } },
      },
    };

    const result = postProcess(spec);

    assert.equal(result.paths["/$metadata"].get.summary, "Custom metadata GET");
    assert.ok(result.paths["/$metadata"].head);
  });

  it("should not overwrite existing HEAD on root '/'", () => {
    const spec = {
      paths: {
        "/": {
          get: { summary: "Root" },
          head: { summary: "Custom HEAD", operationId: "custom/head" },
        },
      },
    };

    const result = postProcess(spec);

    assert.equal(
      result.paths["/"].head.summary,
      "Custom HEAD",
      "Existing HEAD should not be overwritten"
    );
    assert.equal(result.paths["/"].head.operationId, "custom/head");
  });

  it("should not overwrite existing HEAD on '/$metadata'", () => {
    const spec = {
      paths: {
        "/": { get: { summary: "Root" } },
        "/$metadata": {
          get: { summary: "Metadata" },
          head: { summary: "Custom metadata HEAD" },
        },
      },
    };

    const result = postProcess(spec);

    assert.equal(
      result.paths["/$metadata"].head.summary,
      "Custom metadata HEAD"
    );
  });

  it("should handle spec with no paths property", () => {
    const spec = { openapi: "3.0.0", info: { title: "Test" } };
    const result = postProcess(spec);
    // No paths means no HEAD added, no crash
    assert.equal(result.paths, undefined);
  });

  it("should handle empty paths object", () => {
    const spec = { openapi: "3.0.0", paths: {} };
    const result = postProcess(spec);
    // Root "/" and "/$metadata" should be created
    assert.ok(result.paths["/"]);
    assert.ok(result.paths["/"].get);
    assert.ok(result.paths["/"].head);
    assert.ok(result.paths["/$metadata"]);
    assert.ok(result.paths["/$metadata"].get);
    assert.ok(result.paths["/$metadata"].head);
  });

  it("should not add HEAD to entity-level paths", () => {
    const spec = {
      paths: {
        "/": { get: { summary: "Root" } },
        "/EntitySet": { get: { summary: "List" }, post: { summary: "Create" } },
        "/EntitySet('{key}')": {
          get: { summary: "Get" },
          patch: { summary: "Update" },
          delete: { summary: "Delete" },
        },
      },
    };

    const result = postProcess(spec);

    assert.ok(result.paths["/"].head, "Root should have HEAD");
    assert.ok(result.paths["/$metadata"].head, "Metadata should have HEAD");
    assert.equal(
      result.paths["/EntitySet"].head,
      undefined,
      "Entity set should not have HEAD"
    );
    assert.equal(
      result.paths["/EntitySet('{key}')"].head,
      undefined,
      "Entity path should not have HEAD"
    );
  });

  it("should preserve existing root GET when adding HEAD", () => {
    const spec = {
      paths: {
        "/": { get: { summary: "Service document" } },
      },
    };

    const result = postProcess(spec);

    assert.ok(result.paths["/"].get, "GET should still be present");
    assert.equal(result.paths["/"].get.summary, "Service document");
    assert.ok(result.paths["/"].head, "HEAD should be added");
  });

  it("should work with PUT, HEAD, and header post-processing together", () => {
    const spec = {
      paths: {
        "/": { get: { summary: "Root" } },
        "/$metadata": { get: { summary: "Metadata" } },
        "/Items('{id}')": {
          get: { summary: "Get" },
          patch: { summary: "Update" },
          delete: { summary: "Delete" },
        },
        "/Items": {
          get: { summary: "List" },
          post: { summary: "Create" },
        },
      },
    };

    const result = postProcess(spec);

    // PUT added for PATCH
    assert.ok(result.paths["/Items('{id}')"].put, "PUT should be added");
    // HEAD added at root and metadata only
    assert.ok(result.paths["/"].head, "Root HEAD added");
    assert.ok(result.paths["/$metadata"].head, "Metadata HEAD added");
    assert.equal(
      result.paths["/Items('{id}')"].head,
      undefined,
      "No HEAD on entity path"
    );
    // If-Match added to write operations
    assert.ok(
      result.paths["/Items('{id}')"].patch.parameters.some(
        (p) => p.name === "If-Match"
      ),
      "PATCH should have If-Match"
    );
    assert.ok(
      result.paths["/Items('{id}')"].put.parameters.some(
        (p) => p.name === "If-Match"
      ),
      "PUT should have If-Match"
    );
    assert.ok(
      result.paths["/Items('{id}')"].delete.parameters.some(
        (p) => p.name === "If-Match"
      ),
      "DELETE should have If-Match"
    );
    // POST should NOT have If-Match (creates new entity)
    const postIfMatch = result.paths["/Items"].post.parameters
      ? result.paths["/Items"].post.parameters.find(
          (p) => p.name === "If-Match"
        )
      : undefined;
    assert.equal(
      postIfMatch,
      undefined,
      "POST should NOT have If-Match"
    );
    // GET should NOT have If-Match
    assert.equal(
      result.paths["/Items"].get.parameters,
      undefined,
      "GET should not have If-Match"
    );
  });
});

// ── addHeaderParameters behaviour (tested via postProcess) ───

describe("postProcess — addHeaderParameters behaviour", () => {
  it("should NOT add If-Match header to POST operations (creates new entity)", () => {
    const spec = {
      paths: {
        "/Items": { post: { summary: "Create" } },
      },
    };

    const result = postProcess(spec);
    const post = result.paths["/Items"].post;
    const ifMatch = post.parameters
      ? post.parameters.find((p) => p.name === "If-Match")
      : undefined;
    assert.equal(ifMatch, undefined, "POST should not have If-Match");
  });

  it("should add If-Match header to PATCH with correct shape", () => {
    const spec = {
      paths: {
        "/Items('{id}')": { patch: { summary: "Update" } },
      },
    };

    const result = postProcess(spec);
    const params = result.paths["/Items('{id}')"].patch.parameters;

    assert.ok(Array.isArray(params), "parameters should be an array");
    const ifMatch = params.find((p) => p.name === "If-Match");
    assert.ok(ifMatch, "If-Match should be present");
    assert.equal(ifMatch.in, "header");
    assert.equal(ifMatch.required, true);
    assert.equal(ifMatch.schema.type, "string");
    assert.equal(ifMatch["x-ms-visibility"], "important");
  });

  it("should add If-Match header to PATCH operations", () => {
    const spec = {
      paths: {
        "/Items('{id}')": { patch: { summary: "Update" } },
      },
    };

    const result = postProcess(spec);
    const params = result.paths["/Items('{id}')"].patch.parameters;
    assert.ok(params.find((p) => p.name === "If-Match"));
  });

  it("should add If-Match header to PUT operations (created by addPutMethods)", () => {
    const spec = {
      paths: {
        "/Items('{id}')": { patch: { summary: "Update" } },
      },
    };

    const result = postProcess(spec);
    // PUT is created by addPutMethods, then addHeaderParameters adds If-Match
    const params = result.paths["/Items('{id}')"].put.parameters;
    assert.ok(params.find((p) => p.name === "If-Match"));
  });

  it("should add If-Match header to DELETE operations", () => {
    const spec = {
      paths: {
        "/Items('{id}')": { delete: { summary: "Delete" } },
      },
    };

    const result = postProcess(spec);
    const params = result.paths["/Items('{id}')"].delete.parameters;
    assert.ok(params.find((p) => p.name === "If-Match"));
  });

  it("should NOT add If-Match header to GET operations", () => {
    const spec = {
      paths: {
        "/Items": { get: { summary: "List" } },
      },
    };

    const result = postProcess(spec);
    assert.equal(result.paths["/Items"].get.parameters, undefined);
  });

  it("should NOT add If-Match header to HEAD operations", () => {
    const spec = {
      paths: {
        "/": { head: { summary: "Check" } },
      },
    };

    const result = postProcess(spec);
    assert.equal(result.paths["/"].head.parameters, undefined);
  });

  it("should not duplicate If-Match when it already exists", () => {
    const existingHeader = {
      name: "If-Match",
      in: "header",
      description: "Custom ETag",
      required: false,
      schema: { type: "string" },
    };
    const spec = {
      paths: {
        "/Items('{id}')": {
          patch: { summary: "Update", parameters: [existingHeader] },
        },
      },
    };

    const result = postProcess(spec);
    const ifMatchParams = result.paths["/Items('{id}')"].patch.parameters.filter(
      (p) => p.name === "If-Match"
    );
    assert.equal(ifMatchParams.length, 1, "Should have exactly one If-Match");
    assert.equal(
      ifMatchParams[0].description,
      "Custom ETag",
      "Existing header should not be overwritten"
    );
  });

  it("should preserve existing non-If-Match parameters", () => {
    const spec = {
      paths: {
        "/Items('{id}')": {
          patch: {
            summary: "Update",
            parameters: [
              { name: "X-Custom", in: "header", schema: { type: "string" } },
            ],
          },
        },
      },
    };

    const result = postProcess(spec);
    const params = result.paths["/Items('{id}')"].patch.parameters;
    assert.equal(params.length, 2);
    assert.ok(params.find((p) => p.name === "X-Custom"));
    assert.ok(params.find((p) => p.name === "If-Match"));
  });

  it("should add If-Match to multiple write operations on the same path", () => {
    const spec = {
      paths: {
        "/Items('{id}')": {
          get: { summary: "Get" },
          patch: { summary: "Update" },
          delete: { summary: "Delete" },
        },
      },
    };

    const result = postProcess(spec);
    assert.ok(result.paths["/Items('{id}')"].patch.parameters.find((p) => p.name === "If-Match"));
    assert.ok(result.paths["/Items('{id}')"].put.parameters.find((p) => p.name === "If-Match"));
    assert.ok(result.paths["/Items('{id}')"].delete.parameters.find((p) => p.name === "If-Match"));
    assert.equal(result.paths["/Items('{id}')"].get.parameters, undefined);
  });

  it("should handle spec with no paths property", () => {
    const spec = { openapi: "3.0.0", info: { title: "Test" } };
    const result = postProcess(spec);
    assert.equal(result.paths, undefined);
  });

  it("should produce independent header objects per operation", () => {
    const spec = {
      paths: {
        "/A('{id}')": { delete: { summary: "A" } },
        "/B('{id}')": { delete: { summary: "B" } },
      },
    };

    const result = postProcess(spec);
    const headerA = result.paths["/A('{id}')"].delete.parameters.find((p) => p.name === "If-Match");
    const headerB = result.paths["/B('{id}')"].delete.parameters.find((p) => p.name === "If-Match");

    headerA.description = "modified";
    assert.notEqual(
      headerB.description,
      "modified",
      "Headers should be independent objects"
    );
  });

  it("should skip null and non-object path entries", () => {
    const spec = {
      paths: {
        "/ok('{id}')": { delete: { summary: "OK" } },
        "/null-entry": null,
        "/string-entry": "bad",
      },
    };

    const result = postProcess(spec);
    assert.ok(result.paths["/ok('{id}')"].delete.parameters.find((p) => p.name === "If-Match"));
  });
});
