// +--------------------------------------------------------------
// <copyright file="ensureApplyParameter.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

/**
 * Reusable component key and $ref used by the upstream generator for the
 * $apply system query option. We reuse the exact same identifiers so that,
 * when the source metadata already declares Aggregation.ApplySupported (and the
 * generator therefore already emitted $apply), this transform is a no-op.
 *
 * @see node_modules/odata-openapi/lib/csdl2openapi.js (parameters(): param.apply)
 */
const APPLY_COMPONENT_KEY = "apply";
const APPLY_REF = `#/components/parameters/${APPLY_COMPONENT_KEY}`;

/**
 * The $apply parameter definition, matching the shape the generator produces.
 * $apply is a free-form aggregation grammar, so it must be a plain string.
 */
const APPLY_PARAMETER = Object.freeze({
  name: "$apply",
  in: "query",
  required: false,
  description:
    "Apply basic grouping and aggregation functionality, see " +
    "[Aggregation](http://docs.oasis-open.org/odata/odata-data-aggregation-ext/v4.0/odata-data-aggregation-ext-v4.0.html).",
  schema: { type: "string" },
});

/**
 * System query options that only appear on collection reads (never on a
 * single-entity read-by-key). Their presence marks an operation as a
 * collection-GET, which is where $apply is meaningful.
 */
const COLLECTION_OPTION_NAMES = Object.freeze(
  new Set([
    "$filter",
    "$orderby",
    "$search",
    "$count",
    "$top",
    "$skip",
    "$inlinecount",
  ])
);

/**
 * Component-parameter keys the generator uses for collection-only options
 * (referenced via $ref). Used to detect collection-GETs when the option is a
 * $ref rather than an inline parameter.
 */
const COLLECTION_REF_KEYS = Object.freeze(
  new Set(["filter", "orderby", "search", "count", "top", "skip"])
);

/**
 * Resolves the query-option name a parameter represents, following a $ref into
 * components.parameters when necessary.
 *
 * @param {object} param - OpenAPI parameter object (inline or $ref)
 * @param {object} spec - Full OpenAPI spec (for $ref resolution)
 * @returns {string|undefined} The parameter name, or undefined
 */
function resolveParamName(param, spec) {
  if (!param) return undefined;
  if (param.name) return param.name;
  if (typeof param.$ref === "string") {
    const key = param.$ref.split("/").pop();
    const resolved = spec.components?.parameters?.[key];
    if (resolved?.name) return resolved.name;
    if (COLLECTION_REF_KEYS.has(key)) return `$${key}`;
  }
  return undefined;
}

/**
 * Determines whether a GET operation is a collection read (as opposed to a
 * single-entity read-by-key), based on the presence of collection-only query
 * options.
 *
 * @param {object} operation - OpenAPI operation object
 * @param {object} spec - Full OpenAPI spec (for $ref resolution)
 * @returns {boolean} True when the operation is a collection-GET
 */
function isCollectionGet(operation, spec) {
  if (!operation || !Array.isArray(operation.parameters)) return false;
  return operation.parameters.some((p) =>
    COLLECTION_OPTION_NAMES.has(resolveParamName(p, spec))
  );
}

/**
 * Determines whether an operation already exposes the $apply parameter.
 *
 * @param {object} operation - OpenAPI operation object
 * @returns {boolean} True when $apply is already present
 */
function hasApplyParameter(operation) {
  return operation.parameters.some(
    (p) => p.name === "$apply" || p.$ref === APPLY_REF
  );
}

/**
 * Injects the $apply query option into every collection-GET operation.
 *
 * $apply is only emitted by the generator when the source CSDL declares the
 * Aggregation.ApplySupported annotation — which most SAP metadata omits. Under a
 * strict APIM <validate-parameters unspecified-parameter-action="prevent">
 * policy, callers who send $apply are then rejected with 400 even when the
 * backend supports aggregation. This opt-in transform declares $apply (as a
 * free-form string) so APIM allows it through.
 *
 * The parameter is registered once as a reusable component and referenced via
 * $ref, mirroring the generator's own convention. Idempotent.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification with $apply added to collection-GETs
 */
function ensureApplyParameter(spec) {
  if (!spec.paths || typeof spec.paths !== "object") {
    return spec;
  }

  // Collect the collection-GET operations that still need $apply.
  const targets = [];
  for (const pathItem of Object.values(spec.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const operation = pathItem.get;
    if (!operation || !Array.isArray(operation.parameters)) continue;
    if (isCollectionGet(operation, spec) && !hasApplyParameter(operation)) {
      targets.push(operation);
    }
  }

  if (targets.length === 0) {
    return spec;
  }

  // Register the reusable component (preserve an existing one from the generator).
  if (!spec.components) spec.components = {};
  if (!spec.components.parameters) spec.components.parameters = {};
  if (!spec.components.parameters[APPLY_COMPONENT_KEY]) {
    spec.components.parameters[APPLY_COMPONENT_KEY] = { ...APPLY_PARAMETER };
  }

  for (const operation of targets) {
    operation.parameters.push({ $ref: APPLY_REF });
  }

  return spec;
}

module.exports = {
  ensureApplyParameter,
  APPLY_PARAMETER,
  APPLY_COMPONENT_KEY,
  APPLY_REF,
};
