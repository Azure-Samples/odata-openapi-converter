// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for api/lib/helper.js
 * Covers: postProcess (pipeline entry point, including addPutMethods behaviour)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { postProcess } = require("../../core/index.js");

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

  it("should create placeholder schemas for dangling schema references", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/items": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      allOf: [
                        { $ref: "#/components/schemas/Existing" },
                        { $ref: "#/components/schemas/MissingEntity" },
                      ],
                      properties: {
                        download: {
                          items: { $ref: "#/components/schemas/MissingDownload" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Existing: { type: "object" },
        },
      },
    };

    const result = postProcess(spec);

    assert.deepEqual(result.components.schemas.MissingEntity, {
      type: "object",
      description:
        "Schema definition not available (entity set marked non-addressable in source metadata)",
    });
    assert.deepEqual(result.components.schemas.MissingDownload, {
      type: "object",
      description:
        "Schema definition not available (entity set marked non-addressable in source metadata)",
    });
  });

  it("should leave valid schema references unchanged", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/items": {
          get: {
            parameters: [{ $ref: "#/components/parameters/ExistingParameter" }],
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Existing" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Existing: { type: "object" },
        },
        parameters: {
          ExistingParameter: {
            name: "id",
            in: "query",
            schema: { type: "string" },
          },
        },
      },
    };

    const result = postProcess(spec);

    assert.deepEqual(result.components.schemas, {
      Existing: { type: "object" },
    });
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
    // GET should NOT have If-Match (may have SAP params via $ref)
    const getIfMatch = result.paths["/Items"].get.parameters
      ? result.paths["/Items"].get.parameters.find((p) => p.name === "If-Match")
      : undefined;
    assert.equal(getIfMatch, undefined, "GET should not have If-Match");
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
    const getParams = result.paths["/Items"].get.parameters;
    const ifMatch = getParams ? getParams.find((p) => p.name === "If-Match") : undefined;
    assert.equal(ifMatch, undefined, "GET should not have If-Match");
  });

  it("should NOT add If-Match header to HEAD operations", () => {
    const spec = {
      paths: {
        "/": { head: { summary: "Check" } },
      },
    };

    const result = postProcess(spec);
    const headParams = result.paths["/"].head.parameters;
    const ifMatch = headParams ? headParams.find((p) => p.name === "If-Match") : undefined;
    assert.equal(ifMatch, undefined, "HEAD should not have If-Match");
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
    assert.ok(params.length >= 2, "Should have at least custom param + If-Match");
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
    const getIfMatchMulti = result.paths["/Items('{id}')"].get.parameters
      ? result.paths["/Items('{id}')"].get.parameters.find((p) => p.name === "If-Match")
      : undefined;
    assert.equal(getIfMatchMulti, undefined, "GET should not have If-Match");
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

// ── relaxQueryOptionSchemas behaviour (tested via postProcess) ──

describe("postProcess — relaxQueryOptionSchemas behaviour", () => {
  /**
   * Builds a GET operation with the given query parameters.
   * @param {object[]} parameters - OpenAPI parameter objects
   * @returns {object} Minimal spec with one path
   */
  function specWithParams(parameters) {
    return { paths: { "/Products": { get: { parameters } } } };
  }

  const arrayEnum = (name, values, extra = {}) => ({
    name,
    in: "query",
    style: "form",
    explode: false,
    schema: { type: "array", uniqueItems: true, items: { type: "string", enum: values } },
    ...extra,
  });

  for (const name of ["$select", "$expand", "$orderby"]) {
    it(`should relax ${name} array+enum schema to a free-form string`, () => {
      const result = postProcess(specWithParams([arrayEnum(name, ["ID", "Name"])]));
      const param = result.paths["/Products"].get.parameters.find((p) => p.name === name);
      assert.deepEqual(param.schema, { type: "string" });
    });
  }

  it("should drop array-only style/explode keywords", () => {
    const result = postProcess(specWithParams([arrayEnum("$select", ["ID"])]));
    const param = result.paths["/Products"].get.parameters.find((p) => p.name === "$select");
    assert.equal(param.style, undefined);
    assert.equal(param.explode, undefined);
  });

  it("should fold enumerated property names into the description", () => {
    const result = postProcess(specWithParams([arrayEnum("$select", ["ID", "Name"])]));
    const param = result.paths["/Products"].get.parameters.find((p) => p.name === "$select");
    assert.ok(param.description.includes("ID, Name"), "description should list properties");
  });

  it("should preserve an existing description and append the hint", () => {
    const result = postProcess(
      specWithParams([arrayEnum("$expand", ["Category"], { description: "Expand nav." })])
    );
    const param = result.paths["/Products"].get.parameters.find((p) => p.name === "$expand");
    assert.ok(param.description.startsWith("Expand nav."));
    assert.ok(param.description.includes("Category"));
  });

  it("should not touch scalar query options like $top", () => {
    const result = postProcess(
      specWithParams([{ name: "$top", in: "query", schema: { type: "integer", minimum: 0 } }])
    );
    const param = result.paths["/Products"].get.parameters.find((p) => p.name === "$top");
    assert.deepEqual(param.schema, { type: "integer", minimum: 0 });
  });

  it("should be idempotent (running twice yields the same string schema)", () => {
    const once = postProcess(specWithParams([arrayEnum("$orderby", ["Name", "Name desc"])]));
    const twice = postProcess(once);
    const param = twice.paths["/Products"].get.parameters.find((p) => p.name === "$orderby");
    assert.deepEqual(param.schema, { type: "string" });
  });

  it("should relax reusable component parameters", () => {
    const spec = {
      paths: {},
      components: {
        parameters: {
          select: arrayEnum("$select", ["ID", "Name"]),
        },
      },
    };
    const result = postProcess(spec);
    assert.deepEqual(result.components.parameters.select.schema, { type: "string" });
  });

  it("should relax path-level shared parameters", () => {
    const spec = {
      paths: {
        "/Products": {
          parameters: [arrayEnum("$expand", ["Category"])],
          get: {},
        },
      },
    };
    const result = postProcess(spec);
    const param = result.paths["/Products"].parameters.find((p) => p.name === "$expand");
    assert.deepEqual(param.schema, { type: "string" });
  });
});

// ── ensureApplyParameter behaviour (tested via postProcess) ────

describe("postProcess — ensureApplyParameter behaviour", () => {
  const filterParam = { name: "$filter", in: "query", schema: { type: "string" } };
  const selectParam = {
    name: "$select",
    in: "query",
    schema: { type: "array", items: { type: "string", enum: ["ID"] } },
  };

  /**
   * Finds the $apply parameter (inline or $ref) on an operation.
   * @param {object} operation - OpenAPI operation object
   * @returns {object|undefined} The matching parameter entry
   */
  function findApply(operation) {
    return operation.parameters.find(
      (p) => p.name === "$apply" || p.$ref === "#/components/parameters/apply"
    );
  }

  it("should NOT add $apply by default (opt-in)", () => {
    const spec = { paths: { "/Products": { get: { parameters: [filterParam] } } } };
    const result = postProcess(spec);
    assert.equal(findApply(result.paths["/Products"].get), undefined);
  });

  it("should add $apply to a collection-GET when includeApply is true", () => {
    const spec = { paths: { "/Products": { get: { parameters: [filterParam] } } } };
    const result = postProcess(spec, { includeApply: true });
    const applyRef = findApply(result.paths["/Products"].get);
    assert.ok(applyRef, "collection-GET should get $apply");
    assert.equal(applyRef.$ref, "#/components/parameters/apply");
    assert.equal(result.components.parameters.apply.name, "$apply");
    assert.deepEqual(result.components.parameters.apply.schema, { type: "string" });
  });

  it("should NOT add $apply to a single-entity read (no collection options)", () => {
    const spec = {
      paths: { "/Products('{id}')": { get: { parameters: [selectParam] } } },
    };
    const result = postProcess(spec, { includeApply: true });
    assert.equal(findApply(result.paths["/Products('{id}')"].get), undefined);
  });

  it("should detect collection-GETs via $ref markers (top/skip/count)", () => {
    const spec = {
      paths: {
        "/Products": {
          get: { parameters: [{ $ref: "#/components/parameters/top" }] },
        },
      },
      components: {
        parameters: { top: { name: "$top", in: "query", schema: { type: "integer" } } },
      },
    };
    const result = postProcess(spec, { includeApply: true });
    assert.ok(findApply(result.paths["/Products"].get));
  });

  it("should be idempotent (no duplicate $apply on repeat runs)", () => {
    const spec = { paths: { "/Products": { get: { parameters: [filterParam] } } } };
    const once = postProcess(spec, { includeApply: true });
    const twice = postProcess(once, { includeApply: true });
    const applies = twice.paths["/Products"].get.parameters.filter(
      (p) => p.name === "$apply" || p.$ref === "#/components/parameters/apply"
    );
    assert.equal(applies.length, 1);
  });

  it("should preserve a pre-existing apply component and not duplicate the ref", () => {
    const spec = {
      paths: {
        "/Products": {
          get: {
            parameters: [filterParam, { $ref: "#/components/parameters/apply" }],
          },
        },
      },
      components: {
        parameters: {
          apply: { name: "$apply", in: "query", description: "Original.", schema: { type: "string" } },
        },
      },
    };
    const result = postProcess(spec, { includeApply: true });
    assert.equal(result.components.parameters.apply.description, "Original.");
    const applies = result.paths["/Products"].get.parameters.filter(
      (p) => p.$ref === "#/components/parameters/apply"
    );
    assert.equal(applies.length, 1);
  });
});
