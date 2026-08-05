// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for core/converter/escapeXml.js
 *
 * Verifies that stray XML special characters SAP exports leave unescaped
 * (e.g. sap:label="Messzähler & Strom") are repaired into well-formed XML,
 * that already-valid markup/entities/CDATA/comments are preserved, and that
 * the repaired output parses and round-trips through the real converter.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { xml2json } = require("odata-csdl");
const { escapeStrayXmlChars } = require("../../core/converter/escapeXml.js");
const { enrichDescriptions } = require("../../core/converter/enrichDescriptions.js");

describe("escapeStrayXmlChars", () => {
  it("escapes a stray & inside an attribute value", () => {
    const out = escapeStrayXmlChars('<P label="Messzähler & Strom"/>');
    assert.equal(out, '<P label="Messzähler &amp; Strom"/>');
  });

  it("escapes stray < and > inside an attribute value", () => {
    const out = escapeStrayXmlChars('<P label="a < b > c"/>');
    assert.equal(out, '<P label="a &lt; b &gt; c"/>');
  });

  it("does not double-escape existing entities", () => {
    const input = '<P label="A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos; &#228; &#xE4;"/>';
    assert.equal(escapeStrayXmlChars(input), input);
  });

  it("leaves structural markup untouched", () => {
    const input = '<a><b attr="x"/></a>';
    assert.equal(escapeStrayXmlChars(input), input);
  });

  it("escapes a stray & in element text but keeps tags intact", () => {
    const out = escapeStrayXmlChars("<String>Gas & Wasser</String>");
    assert.equal(out, "<String>Gas &amp; Wasser</String>");
  });

  it("does not escape < or > that delimit elements", () => {
    const input = "<a>x</a>";
    assert.equal(escapeStrayXmlChars(input), input);
  });

  it("preserves the contents of CDATA sections verbatim", () => {
    const input = "<a><![CDATA[ a & b < c > d ]]></a>";
    assert.equal(escapeStrayXmlChars(input), input);
  });

  it("preserves the contents of comments verbatim", () => {
    const input = "<a><!-- a & b < c > d --></a>";
    assert.equal(escapeStrayXmlChars(input), input);
  });

  it("preserves processing instructions and declarations", () => {
    const input = '<?xml version="1.0" encoding="utf-8"?><a/>';
    assert.equal(escapeStrayXmlChars(input), input);
  });

  it("handles single-quoted attribute values", () => {
    const out = escapeStrayXmlChars("<P label='A & B'/>");
    assert.equal(out, "<P label='A &amp; B'/>");
  });

  it("does not treat < inside an attribute value as a new tag", () => {
    const out = escapeStrayXmlChars('<P a="1 < 2" b="x"/>');
    assert.equal(out, '<P a="1 &lt; 2" b="x"/>');
  });

  it("is idempotent", () => {
    const once = escapeStrayXmlChars('<P label="Messzähler & Strom < 5"/>');
    assert.equal(escapeStrayXmlChars(once), once);
  });

  it("returns non-string / empty input unchanged", () => {
    assert.equal(escapeStrayXmlChars(""), "");
    assert.equal(escapeStrayXmlChars(null), null);
    assert.equal(escapeStrayXmlChars(undefined), undefined);
  });

  it("makes malformed SAP metadata parseable and preserves the decoded value", () => {
    const edmx = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:sap="http://www.sap.com/Protocols/SAPData">
 <edmx:Reference Uri="x"><edmx:Include Namespace="Org.OData.Core.V1" Alias="Core"/></edmx:Reference>
 <edmx:DataServices m:DataServiceVersion="2.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <Schema Namespace="TEST" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
   <EntityType Name="Thing">
    <Key><PropertyRef Name="Id"/></Key>
    <Property Name="Id" Type="Edm.String" Nullable="false"/>
    <Property Name="Meter" Type="Edm.String" sap:label="Messzähler & Strom" sap:quickinfo="Gas & Wasser"/>
   </EntityType>
  </Schema>
 </edmx:DataServices>
</edmx:Edmx>`;

    // Raw content throws; repaired content parses.
    assert.throws(() => xml2json(edmx, { messages: [] }));
    const repaired = escapeStrayXmlChars(edmx);
    const csdl = xml2json(repaired, { messages: [] });
    enrichDescriptions(csdl, repaired);

    const meter = csdl.TEST.Thing.Meter;
    // sax decodes &amp; back to & — the recovered value must be the original text.
    assert.equal(meter["@Core.Description"], "Messzähler & Strom");
    assert.equal(meter["@Core.LongDescription"], "Gas & Wasser");
  });
});
