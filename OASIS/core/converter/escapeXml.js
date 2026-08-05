// +--------------------------------------------------------------
// <copyright file="escapeXml.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Pre-parse repair for SAP metadata that contains raw,
// unescaped XML special characters inside attribute values.
// escapeStrayXmlChars() walks the document with a tiny state machine and
// escapes only the characters that are genuinely stray, without disturbing
// well-formed markup:
//   • "&"  -> "&amp;"  everywhere except when it already starts a valid entity
//            (&amp; &lt; &gt; &quot; &apos; &#NN; &#xHH;) and except inside
//            CDATA sections and comments.
//   • "<" / ">" -> "&lt;" / "&gt;"  only when they occur inside a quoted
//            attribute value (structural markup is never touched).
// CDATA sections, comments, processing instructions and declarations are
// copied through verbatim.
// ---------------------------------------------------------------

const VALID_ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/;

const TEXT = 0;
const TAG = 1;
const ATTR = 2;

/**
 * Escapes stray "&", "<" and ">" characters that SAP exports leave unescaped
 * inside attribute values (and stray "&" in element text), turning otherwise
 * unparseable metadata into well-formed XML. Well-formed markup, entities,
 * CDATA and comments are preserved unchanged.
 *
 * @param {string} xml - Raw XML/EDMX content
 * @returns {string} Well-formed XML with stray characters escaped
 */
function escapeStrayXmlChars(xml) {
  if (typeof xml !== "string" || xml.length === 0) return xml;

  const n = xml.length;
  const out = [];
  let mark = 0;
  let i = 0;
  let state = TEXT;
  let quote = "";

  const replace = (replacement, advance) => {
    out.push(xml.slice(mark, i), replacement);
    i += advance;
    mark = i;
  };

  // True when a valid entity begins at position i (so we must not escape "&").
  const isEntityAt = () => VALID_ENTITY.test(xml.slice(i, i + 32));

  while (i < n) {
    const c = xml[i];

    if (state === TEXT) {
      if (c === "<") {
        // Skip constructs whose contents must be copied verbatim.
        if (xml.startsWith("<!--", i)) {
          const end = xml.indexOf("-->", i + 4);
          i = end === -1 ? n : end + 3;
          continue;
        }
        if (xml.startsWith("<![CDATA[", i)) {
          const end = xml.indexOf("]]>", i + 9);
          i = end === -1 ? n : end + 3;
          continue;
        }
        if (xml.startsWith("<?", i)) {
          const end = xml.indexOf("?>", i + 2);
          i = end === -1 ? n : end + 2;
          continue;
        }
        if (xml.startsWith("<!", i)) {
          const end = xml.indexOf(">", i + 2);
          i = end === -1 ? n : end + 1;
          continue;
        }
        state = TAG;
        i++;
        continue;
      }
      if (c === "&" && !isEntityAt()) {
        replace("&amp;", 1);
        continue;
      }
      i++;
      continue;
    }

    if (state === TAG) {
      if (c === '"' || c === "'") {
        state = ATTR;
        quote = c;
      } else if (c === ">") {
        state = TEXT;
      }
      i++;
      continue;
    }

    if (c === quote) {
      state = TAG;
      quote = "";
      i++;
      continue;
    }
    if (c === "&") {
      if (!isEntityAt()) {
        replace("&amp;", 1);
        continue;
      }
      i++;
      continue;
    }
    if (c === "<") {
      replace("&lt;", 1);
      continue;
    }
    if (c === ">") {
      replace("&gt;", 1);
      continue;
    }
    i++;
  }

  out.push(xml.slice(mark));
  return out.join("");
}

module.exports = { escapeStrayXmlChars };
