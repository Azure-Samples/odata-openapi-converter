// +--------------------------------------------------------------
// <copyright file="relaxQueryOptionSchemas.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

const { ALL_HTTP_METHODS } = require("../../constants.js");

/**
 * OData system query options whose values are recursive/compositional grammars
 * that cannot be expressed as a flat list of allowed values.
 *
 * The upstream csdl2openapi generator emits these as:
 *   { type: "array", uniqueItems: true, items: { type: "string", enum: [...] } }
 *
 * That enum only lists the top-level property/navigation names, so it rejects
 * perfectly valid OData such as nested expands ($expand=Nav($select=...)),
 * the "*" wildcard, sort direction ($orderby=Prop desc), or comma-separated
 * combinations. Under a strict APIM <validate-parameters
 * specified-parameter-action="prevent"> policy this produces spurious 400s.
 *
 * We relax the schema to a free-form string so APIM accepts any syntactically
 * valid OData value, while preserving the discovered property names in the
 * parameter description for documentation/discoverability.
 */
const RELAXED_QUERY_OPTIONS = Object.freeze(["$select", "$expand", "$orderby"]);

/**
 * Determines whether a parameter is a relaxable array+enum query option.
 *
 * @param {object} param - OpenAPI parameter object (not a $ref)
 * @returns {boolean} True when the parameter should be relaxed to a string
 */
function isRelaxableEnumArray(param) {
  return (
    !!param &&
    param.in === "query" &&
    RELAXED_QUERY_OPTIONS.includes(param.name) &&
    !!param.schema &&
    param.schema.type === "array" &&
    !!param.schema.items &&
    Array.isArray(param.schema.items.enum)
  );
}

/**
 * Rewrites an array+enum query-option parameter in place to a free-form string,
 * folding the enumerated property names into the description. Idempotent.
 *
 * @param {object} param - OpenAPI parameter object to modify in place
 */
function relaxParameter(param) {
  const allowedValues = param.schema.items.enum.filter(
    (v) => typeof v === "string"
  );

  // Serialization keywords only make sense for arrays; drop them.
  delete param.style;
  delete param.explode;

  param.schema = { type: "string" };

  if (allowedValues.length > 0) {
    const hint = `Available properties: ${allowedValues.join(", ")}.`;
    param.description = param.description
      ? `${param.description}\n\n${hint}`
      : hint;
  }
}

/**
 * Relaxes $select / $expand / $orderby query-parameter schemas from the
 * generator's array+enum form to a free-form string.
 *
 * Handles both inline operation parameters and reusable component parameters.
 * References ($ref) are skipped here — the referenced component parameter is
 * relaxed directly when components.parameters is processed.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification with relaxed query-option schemas
 */
function relaxQueryOptionSchemas(spec) {
  // Reusable component parameters
  if (spec.components && spec.components.parameters) {
    for (const param of Object.values(spec.components.parameters)) {
      if (isRelaxableEnumArray(param)) {
        relaxParameter(param);
      }
    }
  }

  // Inline operation parameters (and path-level shared parameters)
  if (spec.paths && typeof spec.paths === "object") {
    for (const pathItem of Object.values(spec.paths)) {
      if (!pathItem || typeof pathItem !== "object") continue;

      const parameterLists = [pathItem.parameters];
      for (const method of ALL_HTTP_METHODS) {
        const operation = pathItem[method];
        if (operation) parameterLists.push(operation.parameters);
      }

      for (const parameters of parameterLists) {
        if (!Array.isArray(parameters)) continue;
        for (const param of parameters) {
          if (isRelaxableEnumArray(param)) {
            relaxParameter(param);
          }
        }
      }
    }
  }

  return spec;
}

module.exports = { relaxQueryOptionSchemas, RELAXED_QUERY_OPTIONS };
