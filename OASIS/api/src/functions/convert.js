// +--------------------------------------------------------------
// <copyright file="convert.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Azure Functions HTTP trigger for OData→OpenAPI conversion.
// Delegates to convert-handler.js for testable business logic.
// ---------------------------------------------------------------

const { app } = require("@azure/functions");
const { convertHandler } = require("../../lib/convert-handler.js");

app.http("convert", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: convertHandler,
});
