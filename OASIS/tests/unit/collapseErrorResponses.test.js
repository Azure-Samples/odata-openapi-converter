// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for the collapseErrorResponses post-processing transform.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  collapseErrorResponses,
} = require("../../core/postprocessing/transforms/collapseErrorResponses.js");
const { convertContent } = require("../../core/index.js");

function specWithResponses(responses) {
  return {
    components: { responses: { error: { description: "Error" } } },
    paths: { "/Things": { get: { responses } } },
  };
}

describe("collapseErrorResponses", () => {
  it("collapses concrete 4xx codes into a single 4XX range $ref", () => {
    const spec = specWithResponses({
      200: { description: "OK" },
      400: { description: "Bad Request" },
      404: { description: "Not Found" },
      409: { description: "Conflict" },
    });

    collapseErrorResponses(spec);
    const responses = spec.paths["/Things"].get.responses;

    assert.deepEqual(Object.keys(responses).sort(), ["200", "4XX"]);
    assert.deepEqual(responses["4XX"], { $ref: "#/components/responses/error" });
  });

  it("collapses concrete 5xx codes into a single 5XX range", () => {
    const spec = specWithResponses({
      200: { description: "OK" },
      500: { description: "Server Error" },
      503: { description: "Unavailable" },
    });

    collapseErrorResponses(spec);
    const responses = spec.paths["/Things"].get.responses;

    assert.deepEqual(Object.keys(responses).sort(), ["200", "5XX"]);
    assert.deepEqual(responses["5XX"], { $ref: "#/components/responses/error" });
  });

  it("leaves success, redirect, and default responses untouched", () => {
    const spec = specWithResponses({
      201: { description: "Created" },
      304: { description: "Not Modified" },
      400: { description: "Bad Request" },
      default: { description: "Unexpected" },
    });

    collapseErrorResponses(spec);
    const responses = spec.paths["/Things"].get.responses;

    assert.ok(responses["201"], "201 should remain");
    assert.ok(responses["304"], "304 should remain");
    assert.ok(responses["default"], "default should remain");
    assert.ok(responses["4XX"], "4XX should be present");
    assert.equal(responses["400"], undefined, "concrete 400 should be removed");
  });

  it("is idempotent when only range keys are present", () => {
    const spec = specWithResponses({
      200: { description: "OK" },
      "4XX": { $ref: "#/components/responses/error" },
    });

    collapseErrorResponses(spec);
    const responses = spec.paths["/Things"].get.responses;

    assert.deepEqual(Object.keys(responses).sort(), ["200", "4XX"]);
  });

  it("inlines the error schema when no shared error response component exists", () => {
    const spec = {
      paths: { "/Things": { get: { responses: { 404: { description: "Not Found" } } } } },
    };

    collapseErrorResponses(spec);
    const range = spec.paths["/Things"].get.responses["4XX"];

    assert.equal(range.$ref, undefined, "should not $ref a missing component");
    assert.equal(range.content["application/json"].schema.$ref, "#/components/schemas/error");
  });

  it("produces range-only error responses end-to-end", () => {
    const minimalCsdl = JSON.stringify({
      "$Version": "4.0",
      "$EntityContainer": "TestService.Container",
      "TestService": {
        "$Kind": "Schema",
        "TestEntity": {
          "$Kind": "EntityType",
          "$Key": ["ID"],
          "ID": { "$Type": "Edm.Int32" },
        },
        "Container": {
          "$Kind": "EntityContainer",
          "TestSet": { "$Collection": true, "$Type": "TestService.TestEntity" },
        },
      },
    });

    const { openapi } = convertContent(minimalCsdl);
    for (const [route, methods] of Object.entries(openapi.paths)) {
      for (const op of Object.values(methods)) {
        if (!op || typeof op !== "object" || !op.responses) continue;
        for (const code of Object.keys(op.responses)) {
          assert.ok(
            !/^[45]\d\d$/.test(code),
            `concrete error code ${code} should not appear on ${route}`
          );
        }
      }
    }
  });
});
