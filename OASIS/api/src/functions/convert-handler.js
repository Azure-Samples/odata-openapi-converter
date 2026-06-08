// +--------------------------------------------------------------
// <copyright file="convert-handler.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Thin HTTP handler for the /api/convert endpoint.
// All business logic delegates to the core engine.
// ---------------------------------------------------------------

const crypto = require("node:crypto");
const { Logger } = require("../../../core/logging/index.js");
const {
  convertContent,
  validateExtension,
  validateFileSize,
  INPUT_EXTENSION_RE,
  HTTP_STATUS_MAP,
  ERROR_CODE,
  scrubPaths,
} = require("../../../core/index.js");
const { STRINGS } = require("../../../core/strings.js");

/**
 * HTTP handler for the /api/convert endpoint.
 *
 * @param {import("@azure/functions").HttpRequest} request
 * @param {import("@azure/functions").InvocationContext} context
 * @returns {Promise<import("@azure/functions").HttpResponseInit>}
 */
async function convertHandler(request, context) {
  const correlationId = request.headers?.get?.("x-ms-request-id") || crypto.randomUUID();
  const logger = new Logger({ context, correlationId, operationName: "convert" });
  const responseHeaders = { "x-ms-request-id": correlationId };

  try {
    const { fileName, content, serverUrl, title } = await request.json();

    if (!fileName || !content) {
      return {
        status: 400,
        headers: responseHeaders,
        jsonBody: {
          error: STRINGS.errors.MISSING_BODY_FIELDS,
          errorType: "InvalidContentError",
          code: ERROR_CODE.INVALID_CONTENT,
        },
      };
    }

    validateExtension(fileName);
    validateFileSize(Buffer.byteLength(content, "utf8"));

    // Build conversion options from optional server URL and title
    const options = {};
    if (serverUrl) {
      try {
        const url = new URL(serverUrl);
        options.scheme = url.protocol.replace(":", "");
        options.host = url.host;
        options.basePath = url.pathname || "/";
      } catch {
        return {
          status: 400,
          headers: responseHeaders,
          jsonBody: {
            error: STRINGS.errors.INVALID_SERVER_URL,
            errorType: "InvalidContentError",
            code: ERROR_CODE.INVALID_CONTENT,
          },
        };
      }
    }
    if (title) {
      options.defaultTitle = title;
    }

    const outputName = fileName.replace(INPUT_EXTENSION_RE, "-openapi.json");
    const { openapi, warnings, apiType } = convertContent(content, options);

    logger.success({ fileName: outputName, apiType });

    return {
      headers: responseHeaders,
      jsonBody: { fileName: outputName, data: openapi, warnings, apiType },
    };
  } catch (err) {
    const status = HTTP_STATUS_MAP[err.name] || 500;
    const isServerError = status >= 500;

    if (isServerError) {
      logger.failure(err, status, {
        errorMessage: scrubPaths(err.message),
        errorStack: scrubPaths(err.stack),
        validationMessages: err.validationMessages || [],
      });
    } else {
      logger.failure(err, status);
    }

    const body = {
      error: isServerError ? STRINGS.errors.INTERNAL_ERROR : err.message,
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

    return { status, headers: responseHeaders, jsonBody: body };
  }
}

module.exports = { convertHandler };
