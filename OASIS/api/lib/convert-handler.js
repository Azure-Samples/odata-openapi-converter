// +--------------------------------------------------------------
// <copyright file="convert-handler.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Pure handler logic for the /api/convert endpoint.
// Handles a single file per request — Azure Functions auto-scales
// to handle parallel requests from the frontend.
// Separated from the Azure Functions registration so it can be
// unit-tested without requiring @azure/functions.
// ---------------------------------------------------------------

const { INPUT_EXTENSION_RE, HTTP_STATUS_MAP, ERROR_CODE, MAX_FILE_SIZE_BYTES } = require("./constants.js");
const { convertContent } = require("./converter.js");
const { validateExtension } = require("./validation.js");
const { FileTooLargeError } = require("./errors.js");

/**
 * HTTP handler for the /api/convert endpoint.
 *
 * Expects: POST `{ fileName, content }` → `{ fileName, data, warnings }`
 * The frontend sends one request per file; Azure Functions auto-scales
 * to handle concurrent requests.
 *
 * @param {import("@azure/functions").HttpRequest} request
 * @param {import("@azure/functions").InvocationContext} context
 * @returns {Promise<import("@azure/functions").HttpResponseInit>}
 */
async function convertHandler(request, context) {
  try {
    const { fileName, content } = await request.json();

    if (!fileName || !content) {
      return {
        status: 400,
        jsonBody: {
          error: "Request body must include 'fileName' and 'content'.",
          errorType: "InvalidContentError",
          code: ERROR_CODE.INVALID_CONTENT,
        },
      };
    }

    validateExtension(fileName);

    const contentBytes = Buffer.byteLength(content, "utf8");
    if (contentBytes > MAX_FILE_SIZE_BYTES) {
      throw new FileTooLargeError(contentBytes);
    }

    const outputName = fileName.replace(INPUT_EXTENSION_RE, "-openapi.json");
    const { openapi, warnings } = convertContent(content);

    return {
      jsonBody: { fileName: outputName, data: openapi, warnings },
    };
  } catch (err) {
    const status = HTTP_STATUS_MAP[err.name] || 500;
    const isServerError = status >= 500;

    // 4xx — log only the error code (message may echo user input).
    // 5xx — log full details for debugging, but scrub filesystem paths
    //        that could reveal server directory structure.
    if (isServerError) {
      const scrub = (s) => (s || "").replace(/[A-Z]:\\[^\s:)]+|\/[\w./-]+/gi, "<path>");
      context.error("Conversion failed:", {
        name: err.name,
        code: err.code || ERROR_CODE.INTERNAL_ERROR,
        status,
        message: scrub(err.message),
        stack: scrub(err.stack),
        validationMessages: err.validationMessages || [],
      });
    } else {
      context.error("Conversion failed:", {
        name: err.name,
        code: err.code || ERROR_CODE.INTERNAL_ERROR,
        status,
      });
    }

    const body = {
      error: isServerError
        ? "An internal error occurred during conversion. Please try again or contact support."
        : err.message,
      errorType: err.name || "Error",
      code: err.code || ERROR_CODE.INTERNAL_ERROR,
    };

    if (err.line !== undefined) {
      body.line = err.line;
      body.column = err.column;
    }
    if (err.validationMessages?.length) {
      body.validationMessages = err.validationMessages;
    }

    return { status, jsonBody: body };
  }
}

module.exports = { convertHandler };
