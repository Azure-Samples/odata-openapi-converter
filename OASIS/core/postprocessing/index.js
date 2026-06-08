// +--------------------------------------------------------------
// <copyright file="index.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

const { PostProcessorBuilder } = require("./PostProcessorBuilder.js");
const { addPutMethods } = require("./transforms/addPutMethods.js");
const { addHeadMethods } = require("./transforms/addHeadMethods.js");
const { addIfMatchHeaders, IF_MATCH_HEADER } = require("./transforms/addIfMatchHeaders.js");
const { addSapParameters, SAP_PARAMETERS } = require("./transforms/addSapParameters.js");
const { removeDefaultServer } = require("./transforms/removeDefaultServer.js");

/**
 * Convenience function that applies the standard post-processing pipeline.
 * Drop-in replacement for the old helper.js postProcess() function.
 *
 * @param {object|string} openApiSpec - OpenAPI spec object or JSON string
 * @returns {object} Fully post-processed OpenAPI specification
 */
function postProcess(openApiSpec) {
  return PostProcessorBuilder.standard().build().apply(openApiSpec);
}

module.exports = {
  PostProcessorBuilder,
  postProcess,
  addPutMethods,
  addHeadMethods,
  addIfMatchHeaders,
  addSapParameters,
  removeDefaultServer,
  IF_MATCH_HEADER,
  SAP_PARAMETERS,
};
