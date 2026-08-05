// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for core/converter/enrichDescriptions.js
 *
 * Verifies that SAP field labels/tooltips become OpenAPI title/description
 * for both OData V2 (inline sap:* attributes, where the label is destroyed
 * during parsing) and OData V4 (external SAP Common annotations), and that
 * the transform is alias-aware, non-destructive, idempotent and safe.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { xml2json } = require("odata-csdl");
const { csdl2openapi } = require("odata-openapi");
const { enrichDescriptions } = require("../../core/converter/enrichDescriptions.js");

// ── helpers ───────────────────────────────────────────────────

/** Returns the property schema object for a given type/property. */
function propSchema(openapi, typeName, property) {
  const schema = openapi.components.schemas[typeName];
  return schema && schema.properties && schema.properties[property];
}

const V2_EDMX = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:sap="http://www.sap.com/Protocols/SAPData">
 <edmx:Reference Uri="https://oasis-tcs.github.io/odata-vocabularies/vocabularies/Org.OData.Core.V1.json">
  <edmx:Include Namespace="Org.OData.Core.V1" Alias="Core"/>
 </edmx:Reference>
 <edmx:DataServices m:DataServiceVersion="2.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <Schema Namespace="TEST" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
   <EntityType Name="Thing">
    <Key><PropertyRef Name="Id"/></Key>
    <Property Name="Id" Type="Edm.String" Nullable="false"/>
    <Property Name="Both" Type="Edm.String" sap:label="TheLabel" sap:quickinfo="TheQuickInfo"/>
    <Property Name="LabelOnly" Type="Edm.String" sap:label="OnlyLabel"/>
    <Property Name="QuickOnly" Type="Edm.String" sap:quickinfo="OnlyQuick"/>
    <Property Name="Plain" Type="Edm.String"/>
   </EntityType>
   <EntityContainer Name="Container" m:IsDefaultEntityContainer="true">
    <EntitySet Name="Things" EntityType="TEST.Thing"/>
   </EntityContainer>
  </Schema>
 </edmx:DataServices>
</edmx:Edmx>`;

/** Builds a minimal V4 EDMX using the supplied vocabulary aliases. */
function v4Edmx(commonAlias, coreAlias) {
  return `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
 <edmx:Reference Uri="https://example/common">
  <edmx:Include Namespace="com.sap.vocabularies.Common.v1" Alias="${commonAlias}"/>
 </edmx:Reference>
 <edmx:Reference Uri="https://example/core">
  <edmx:Include Namespace="Org.OData.Core.V1" Alias="${coreAlias}"/>
 </edmx:Reference>
 <edmx:DataServices>
  <Schema Namespace="test.svc" Alias="Self" xmlns="http://docs.oasis-open.org/odata/ns/edm">
   <EntityType Name="Product_Type">
    <Key><PropertyRef Name="Id"/></Key>
    <Property Name="Id" Type="Edm.String" Nullable="false"/>
    <Property Name="Product" Type="Edm.String"/>
   </EntityType>
   <Annotations Target="Self.Product_Type/Product">
    <Annotation Term="${commonAlias}.Label" String="Product"/>
    <Annotation Term="${commonAlias}.QuickInfo" String="Product Number"/>
   </Annotations>
   <EntityContainer Name="Container">
    <EntitySet Name="Products" EntityType="test.svc.Product_Type"/>
   </EntityContainer>
  </Schema>
 </edmx:DataServices>
</edmx:Edmx>`;
}

// ── V2: inline sap:* attributes ───────────────────────────────

describe("enrichDescriptions — V2 (inline sap:* attributes)", () => {
  it("maps sap:label to title and sap:quickinfo to description", () => {
    const csdl = enrichDescriptions(xml2json(V2_EDMX), V2_EDMX);
    const openapi = csdl2openapi(csdl, { messages: [] });
    const p = propSchema(openapi, "TEST.Thing", "Both");
    assert.equal(p.title, "TheLabel");
    assert.equal(p.description, "TheQuickInfo");
  });

  it("keeps title from sap:label when there is no quickinfo", () => {
    const csdl = enrichDescriptions(xml2json(V2_EDMX), V2_EDMX);
    const openapi = csdl2openapi(csdl, { messages: [] });
    const p = propSchema(openapi, "TEST.Thing", "LabelOnly");
    assert.equal(p.title, "OnlyLabel");
    assert.equal(p.description, undefined);
  });

  it("surfaces sap:quickinfo as description when there is no label", () => {
    const csdl = enrichDescriptions(xml2json(V2_EDMX), V2_EDMX);
    const openapi = csdl2openapi(csdl, { messages: [] });
    assert.equal(propSchema(openapi, "TEST.Thing", "QuickOnly").description, "OnlyQuick");
  });

  it("leaves properties without SAP annotations untouched", () => {
    const csdl = enrichDescriptions(xml2json(V2_EDMX), V2_EDMX);
    const openapi = csdl2openapi(csdl, { messages: [] });
    const p = propSchema(openapi, "TEST.Thing", "Plain");
    assert.equal(p.title, undefined);
    assert.equal(p.description, undefined);
  });

  it("cannot recover the label without the raw XML (regression guard)", () => {
    // Without rawXml the label is unrecoverable; the upstream bug persists.
    const csdl = enrichDescriptions(xml2json(V2_EDMX));
    const openapi = csdl2openapi(csdl, { messages: [] });
    const p = propSchema(openapi, "TEST.Thing", "Both");
    assert.equal(p.title, "TheQuickInfo");
    assert.equal(p.description, undefined);
  });
});

// ── V4: external SAP Common annotations ───────────────────────

describe("enrichDescriptions — V4 (external SAP Common annotations)", () => {
  it("copies Common.Label/QuickInfo to Core Description/LongDescription", () => {
    const edmx = v4Edmx("SAP__common", "SAP__core");
    const openapi = csdl2openapi(enrichDescriptions(xml2json(edmx), edmx), { messages: [] });
    const p = propSchema(openapi, "test.svc.Product_Type", "Product");
    assert.equal(p.title, "Product");
    assert.equal(p.description, "Product Number");
  });

  it("resolves vocabulary aliases regardless of the chosen names", () => {
    // Same service but with completely different aliases.
    const edmx = v4Edmx("Common", "Core");
    const openapi = csdl2openapi(enrichDescriptions(xml2json(edmx), edmx), { messages: [] });
    const p = propSchema(openapi, "test.svc.Product_Type", "Product");
    assert.equal(p.title, "Product");
    assert.equal(p.description, "Product Number");
  });

  it("works for JSON (no raw XML) input", () => {
    // Simulate JSON CSDL input: enrich without rawXml still applies the V4 step.
    const edmx = v4Edmx("SAP__common", "SAP__core");
    const openapi = csdl2openapi(enrichDescriptions(xml2json(edmx)), { messages: [] });
    assert.equal(propSchema(openapi, "test.svc.Product_Type", "Product").title, "Product");
  });

  it("does not overwrite an existing Core.Description", () => {
    const edmx = v4Edmx("SAP__common", "SAP__core");
    const csdl = xml2json(edmx);
    csdl["test.svc"].$Annotations["Self.Product_Type/Product"]["@SAP__core.Description"] = "Preset";
    enrichDescriptions(csdl, edmx);
    const openapi = csdl2openapi(csdl, { messages: [] });
    assert.equal(propSchema(openapi, "test.svc.Product_Type", "Product").title, "Preset");
  });
});

// ── idempotency & safety ──────────────────────────────────────

describe("enrichDescriptions — idempotency and safety", () => {
  it("is idempotent when run twice", () => {
    const first = enrichDescriptions(xml2json(V2_EDMX), V2_EDMX);
    const snapshot = JSON.stringify(first);
    const second = enrichDescriptions(first, V2_EDMX);
    assert.equal(JSON.stringify(second), snapshot);
  });

  it("returns non-object input unchanged", () => {
    assert.equal(enrichDescriptions(null), null);
    assert.equal(enrichDescriptions(undefined), undefined);
    assert.equal(enrichDescriptions("nope"), "nope");
  });

  it("does not throw on malformed XML", () => {
    const csdl = xml2json(V2_EDMX);
    assert.doesNotThrow(() => enrichDescriptions(csdl, "<Edmx><unclosed>"));
  });

  it("ignores non-XML raw content", () => {
    const csdl = xml2json(V2_EDMX);
    assert.doesNotThrow(() => enrichDescriptions(csdl, "{ not xml }"));
  });
});
