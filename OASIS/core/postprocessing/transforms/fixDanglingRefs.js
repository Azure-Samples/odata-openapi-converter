// +--------------------------------------------------------------
// <copyright file="fixDanglingRefs.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

/**
 * Prefix for schema component references within an OpenAPI document.
 */
const SCHEMA_REF_PREFIX = "#/components/schemas/";

/**
 * Placeholder schema injected when the source metadata references a schema
 * that was not emitted by the upstream OData-to-OpenAPI library.
 */
const PLACEHOLDER_SCHEMA = Object.freeze({
  type: "object",
  description:
    "Schema definition not available (entity set marked non-addressable in source metadata)",
});

/**
 * Decodes a single JSON Pointer token.
 *
 * @param {string} token - Encoded JSON Pointer token
 * @returns {string} Decoded token value
 */
function decodeJsonPointerToken(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Recursively scans an OpenAPI node and collects referenced schema names.
 *
 * @param {*} node - Current node to inspect
 * @param {Set<string>} [refs] - Accumulator for schema names
 * @param {WeakSet<object>} [seen] - Tracks visited objects to avoid cycles
 * @returns {Set<string>} Referenced schema names
 */
function collectReferencedSchemaNames(node, refs = new Set(), seen = new WeakSet()) {
  if (!node || typeof node !== "object") {
    return refs;
  }

  if (seen.has(node)) {
    return refs;
  }
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) {
      collectReferencedSchemaNames(item, refs, seen);
    }
    return refs;
  }

  if (typeof node.$ref === "string" && node.$ref.startsWith(SCHEMA_REF_PREFIX)) {
    refs.add(decodeJsonPointerToken(node.$ref.slice(SCHEMA_REF_PREFIX.length)));
  }

  for (const value of Object.values(node)) {
    collectReferencedSchemaNames(value, refs, seen);
  }

  return refs;
}

/**
 * Creates placeholder component schemas for any dangling schema references.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification
 */
function fixDanglingRefs(spec) {
  if (!spec || typeof spec !== "object") {
    return spec;
  }

  const referencedSchemaNames = collectReferencedSchemaNames(spec);
  if (referencedSchemaNames.size === 0) {
    return spec;
  }

  if (!spec.components || typeof spec.components !== "object" || Array.isArray(spec.components)) {
    spec.components = {};
  }

  if (
    !spec.components.schemas ||
    typeof spec.components.schemas !== "object" ||
    Array.isArray(spec.components.schemas)
  ) {
    spec.components.schemas = {};
  }

  for (const schemaName of Array.from(referencedSchemaNames).sort()) {
    if (schemaName in spec.components.schemas) {
      continue;
    }

    spec.components.schemas[schemaName] = { ...PLACEHOLDER_SCHEMA };
  }

  return spec;
}

module.exports = {
  fixDanglingRefs,
  collectReferencedSchemaNames,
  PLACEHOLDER_SCHEMA,
  SCHEMA_REF_PREFIX,
};
