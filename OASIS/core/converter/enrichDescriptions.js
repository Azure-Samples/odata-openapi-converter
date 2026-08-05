// +--------------------------------------------------------------
// <copyright file="enrichDescriptions.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview CSDL-level enrichment that makes SAP field captions and
// tooltips survive the conversion to OpenAPI title/description.
//
// The upstream odata-csdl / odata-openapi libraries do not emit proper
// title/description for SAP annotations, but they do so differently per
// OData version:
//
//   V2 (inline sap:* attributes): odata-csdl maps BOTH sap:label and
//       sap:quickinfo onto the single Core.Description term, and quickinfo
//       overwrites the label — so the label is destroyed during parsing.
//       The only place the label still exists is the raw EDMX, so we do a
//       read-only pass over the XML to recover {label, quickinfo} per
//       element, then write them onto the parsed CSDL nodes as
//       Core.Description (title) and Core.LongDescription (description).
//
//   V4 (external SAP Common annotations): the values survive parsing intact
//       inside $Annotations, but use the com.sap.vocabularies.Common.v1
//       vocabulary (Label / QuickInfo), which the generator ignores for
//       title/description. We copy them onto the Core vocabulary
//       (Description / LongDescription) so the generator picks them up.
//
// Both steps target the exact alias-resolved term keys the generator reads
// (see edm.js `vocabularies()` in odata-openapi), so the enrichment works
// regardless of how the document aliases its vocabularies.
// ---------------------------------------------------------------

const sax = require("sax");

const CORE_NAMESPACE = "Org.OData.Core.V1";
const COMMON_NAMESPACE = "com.sap.vocabularies.Common.v1";

/**
 * Builds the namespace/alias → alias map exactly as odata-openapi's edm.js
 * does, so the term keys we compute match the ones the generator reads.
 *
 * @param {object} csdl - Parsed CSDL JSON
 * @returns {Object<string,string>} Map of vocabulary namespace to its alias
 */
function buildAliasMap(csdl) {
  const alias = {};
  for (const reference of Object.values(csdl.$Reference || {})) {
    for (const include of reference.$Include || []) {
      alias[include.$Namespace] = include.$Alias ?? include.$Namespace;
    }
  }
  for (const [namespace, schema] of Object.entries(csdl)) {
    if (namespace.startsWith("$") || !schema || typeof schema !== "object") continue;
    alias[namespace] = schema.$Alias || namespace;
  }
  return alias;
}

/**
 * Computes the annotation key for a vocabulary term using the document's
 * alias, mirroring odata-openapi: `@${alias[namespace] || namespace}.${term}`.
 *
 * @param {Object<string,string>} alias - Alias map from buildAliasMap
 * @param {string} vocabularyNamespace - Full vocabulary namespace
 * @param {string} term - Term name (e.g. "Description")
 * @returns {string} Annotation key (e.g. "@Core.Description")
 */
function termKey(alias, vocabularyNamespace, term) {
  return `@${alias[vocabularyNamespace] || vocabularyNamespace}.${term}`;
}

/**
 * V4 step: within every schema's $Annotations, copy the SAP Common
 * Label/QuickInfo values onto the Core Description/LongDescription terms so
 * the generator emits them as title/description. Existing Core values are
 * preserved (idempotent, non-destructive).
 *
 * @param {object} csdl - Parsed CSDL JSON (mutated in place)
 * @param {object} keys - Resolved term keys
 * @private
 */
function copyCommonToCore(csdl, keys) {
  const { commonLabel, commonQuickInfo, coreDescription, coreLongDescription } = keys;
  for (const [namespace, schema] of Object.entries(csdl)) {
    if (namespace.startsWith("$") || !schema || typeof schema !== "object") continue;
    const annotations = schema.$Annotations;
    if (!annotations || typeof annotations !== "object") continue;
    for (const target of Object.values(annotations)) {
      if (!target || typeof target !== "object") continue;
      if (target[commonLabel] !== undefined && target[coreDescription] === undefined) {
        target[coreDescription] = target[commonLabel];
      }
      if (target[commonQuickInfo] !== undefined && target[coreLongDescription] === undefined) {
        target[coreLongDescription] = target[commonQuickInfo];
      }
    }
  }
}

/**
 * V2 step (read-only): scans the raw EDMX for elements carrying sap:label /
 * sap:quickinfo and records their values keyed by their location. The XML is
 * never modified; we only read it to recover the label that odata-csdl
 * discards during parsing.
 *
 * @param {string} xml - Raw EDMX/XML content
 * @returns {Array<{namespace:string,type:string,element:(string|null),label:(string|undefined),quickinfo:(string|undefined)}>}
 * @private
 */
function recoverSapAnnotations(xml) {
  const recovered = [];
  const parser = sax.parser(true); // strict mode preserves original casing
  let namespace = null;
  let type = null;

  parser.onopentag = (node) => {
    const attributes = node.attributes || {};
    const label = attributes["sap:label"];
    const quickinfo = attributes["sap:quickinfo"];

    if (node.name === "Schema") {
      namespace = attributes.Namespace;
    } else if (node.name === "EntityType" || node.name === "ComplexType") {
      type = attributes.Name;
      if (namespace && type && (label !== undefined || quickinfo !== undefined)) {
        recovered.push({ namespace, type, element: null, label, quickinfo });
      }
    } else if (
      (node.name === "Property" || node.name === "NavigationProperty") &&
      namespace &&
      type &&
      attributes.Name &&
      (label !== undefined || quickinfo !== undefined)
    ) {
      recovered.push({ namespace, type, element: attributes.Name, label, quickinfo });
    }
  };

  parser.onclosetag = (name) => {
    if (name === "EntityType" || name === "ComplexType") type = null;
  };

  parser.write(xml).close();
  return recovered;
}

/**
 * Applies recovered SAP annotations onto the parsed CSDL nodes, writing the
 * label as Core.Description (title) and the quickinfo as Core.LongDescription
 * (description). The label deliberately overwrites the wrong value that
 * odata-csdl placed in Core.Description.
 *
 * Note: when an element has quickinfo but no label, Core.Description is left
 * as-is (odata-csdl set it to the quickinfo). In practice SAP always pairs a
 * label with a quickinfo, so this edge case is negligible.
 *
 * @param {object} csdl - Parsed CSDL JSON (mutated in place)
 * @param {Array} recovered - Entries from recoverSapAnnotations
 * @param {object} keys - Resolved term keys
 * @private
 */
function applyRecovered(csdl, recovered, keys) {
  const { coreDescription, coreLongDescription } = keys;
  for (const { namespace, type, element, label, quickinfo } of recovered) {
    const schema = csdl[namespace];
    const typeNode = schema && schema[type];
    if (!typeNode || typeof typeNode !== "object") continue;
    const node = element === null ? typeNode : typeNode[element];
    if (!node || typeof node !== "object") continue;
    if (label !== undefined) node[coreDescription] = label;
    if (quickinfo !== undefined) node[coreLongDescription] = quickinfo;
  }
}

/**
 * Enriches a parsed CSDL document so SAP field labels/tooltips become OpenAPI
 * title/description. Handles OData V2 (inline sap:* attributes) and V4
 * (external SAP Common annotations). Mutates and returns the CSDL.
 *
 * @param {object} csdl - Parsed CSDL JSON
 * @param {string} [rawXml] - Raw EDMX content; required to recover V2 labels
 *   that odata-csdl discards. Omit for JSON input (only the V4 step applies).
 * @returns {object} The same csdl object, enriched in place
 */
function enrichDescriptions(csdl, rawXml) {
  if (!csdl || typeof csdl !== "object") return csdl;

  const alias = buildAliasMap(csdl);
  const keys = {
    coreDescription: termKey(alias, CORE_NAMESPACE, "Description"),
    coreLongDescription: termKey(alias, CORE_NAMESPACE, "LongDescription"),
    commonLabel: termKey(alias, COMMON_NAMESPACE, "Label"),
    commonQuickInfo: termKey(alias, COMMON_NAMESPACE, "QuickInfo"),
  };

  copyCommonToCore(csdl, keys);

  if (typeof rawXml === "string" && rawXml.trimStart().startsWith("<")) {
    try {
      const recovered = recoverSapAnnotations(rawXml);
      applyRecovered(csdl, recovered, keys);
    } catch {
      // A malformed-XML failure here must never break conversion; the field
      // descriptions simply won't be recovered.
    }
  }

  return csdl;
}

module.exports = { enrichDescriptions };
