// +--------------------------------------------------------------
// <copyright file="requireTopParameter.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

/**
 * Component-parameter key the generator uses for the $top system query option
 * (referenced via $ref on every collection-GET). We edit this single shared
 * component so the change applies uniformly wherever $top is referenced.
 *
 * @see node_modules/odata-openapi/lib/csdl2openapi.js (components.parameters.top)
 */
const TOP_COMPONENT_KEY = "top";

/**
 * Default page size injected into the $top schema. Acts as a documented guard
 * value against unbounded full-table reads (e.g. for an APIM
 * set-query-parameter policy that supplies it when absent).
 */
const TOP_DEFAULT_PAGE_SIZE = 10;

/**
 * Makes the shared $top query option required and gives it a default page size.
 * Idempotent: re-running produces the same result.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification with a required, defaulted $top
 */
function requireTopParameter(spec) {
  const top = spec?.components?.parameters?.[TOP_COMPONENT_KEY];
  if (!top || typeof top !== "object") {
    return spec;
  }

  top.required = true;
  if (!top.schema || typeof top.schema !== "object") {
    top.schema = { type: "integer", minimum: 0 };
  }
  top.schema.default = TOP_DEFAULT_PAGE_SIZE;

  return spec;
}

module.exports = {
  requireTopParameter,
  TOP_COMPONENT_KEY,
  TOP_DEFAULT_PAGE_SIZE,
};
