// +--------------------------------------------------------------
// <copyright file="collapseErrorResponses.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

/**
 * OpenAPI operation keys that may carry a `responses` object.
 */
const HTTP_METHODS = Object.freeze([
  "get",
  "put",
  "post",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
]);

/**
 * Shared error Response Object the generator registers under
 * components.responses (referenced via $ref). We reuse it so the collapsed
 * range responses stay DRY, exactly like the generator's own `4XX` default.
 *
 * @see node_modules/odata-openapi/lib/csdl2openapi.js (components.responses.error)
 */
const ERROR_RESPONSE_KEY = "error";
const ERROR_RESPONSE_REF = `#/components/responses/${ERROR_RESPONSE_KEY}`;
const ERROR_SCHEMA_REF = "#/components/schemas/error";

/**
 * Range keys the concrete error codes collapse into.
 */
const CLIENT_ERROR_RANGE = "4XX";
const SERVER_ERROR_RANGE = "5XX";

/**
 * Determines the range key a concrete numeric status code belongs to.
 *
 * @param {string} code - Response object key (e.g. "404")
 * @returns {string|undefined} "4XX", "5XX", or undefined when not a 4xx/5xx code
 */
function rangeFor(code) {
  if (/^4\d\d$/.test(code)) return CLIENT_ERROR_RANGE;
  if (/^5\d\d$/.test(code)) return SERVER_ERROR_RANGE;
  return undefined;
}

/**
 * Builds the Response Object a collapsed range key should point at. Prefers the
 * shared components.responses.error $ref (the generator's convention); falls
 * back to an inline error response referencing the error schema when that
 * component is absent.
 *
 * @param {object} spec - Full OpenAPI spec (for component lookup)
 * @returns {object} Response Object for the range key
 */
function rangeResponse(spec) {
  if (spec.components?.responses?.[ERROR_RESPONSE_KEY]) {
    return { $ref: ERROR_RESPONSE_REF };
  }
  return {
    description: "Error",
    content: { "application/json": { schema: { $ref: ERROR_SCHEMA_REF } } },
  };
}

/**
 * Collapses concrete client/server error status codes into the `4XX`/`5XX`
 * ranges on a single operation's responses.
 *
 * @param {object} operation - OpenAPI operation object
 * @param {object} spec - Full OpenAPI spec (for component lookup)
 */
function collapseOperation(operation, spec) {
  const responses = operation.responses;
  if (!responses || typeof responses !== "object") return;

  let hasClientError = Object.prototype.hasOwnProperty.call(responses, CLIENT_ERROR_RANGE);
  let hasServerError = Object.prototype.hasOwnProperty.call(responses, SERVER_ERROR_RANGE);

  for (const code of Object.keys(responses)) {
    const range = rangeFor(code);
    if (!range) continue;

    delete responses[code];
    if (range === CLIENT_ERROR_RANGE) hasClientError = true;
    else hasServerError = true;
  }

  if (hasClientError && !responses[CLIENT_ERROR_RANGE]) {
    responses[CLIENT_ERROR_RANGE] = rangeResponse(spec);
  }
  if (hasServerError && !responses[SERVER_ERROR_RANGE]) {
    responses[SERVER_ERROR_RANGE] = rangeResponse(spec);
  }
}

/**
 * Normalizes error responses so the spec always expresses client/server errors
 * as the `4XX`/`5XX` ranges rather than concrete status codes.
 * Idempotent.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification with range-only error responses
 */
function collapseErrorResponses(spec) {
  if (!spec.paths || typeof spec.paths !== "object") {
    return spec;
  }

  for (const pathItem of Object.values(spec.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation && typeof operation === "object") {
        collapseOperation(operation, spec);
      }
    }
  }

  return spec;
}

module.exports = {
  collapseErrorResponses,
  CLIENT_ERROR_RANGE,
  SERVER_ERROR_RANGE,
};
