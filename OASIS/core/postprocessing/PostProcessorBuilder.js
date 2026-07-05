// +--------------------------------------------------------------
// <copyright file="PostProcessorBuilder.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Builder pattern for composing OpenAPI post-processing steps.
// Each transform is independently testable and can be included/excluded.
// ---------------------------------------------------------------

const { addPutMethods } = require("./transforms/addPutMethods.js");
const { addHeadMethods } = require("./transforms/addHeadMethods.js");
const { addIfMatchHeaders } = require("./transforms/addIfMatchHeaders.js");
const { addSapParameters } = require("./transforms/addSapParameters.js");
const { relaxQueryOptionSchemas } = require("./transforms/relaxQueryOptionSchemas.js");
const { fixDanglingRefs } = require("./transforms/fixDanglingRefs.js");
const { removeDefaultServer } = require("./transforms/removeDefaultServer.js");

/**
 * Builder for composing post-processing transforms on an OpenAPI spec.
 * Provides a fluent API to selectively include transforms.
 *
 * @example
 * const processor = new PostProcessorBuilder()
 *   .withPutMethods()
 *   .withHeadMethods()
 *   .withIfMatchHeaders()
 *   .withSapParameters()
 *   .withFixDanglingRefs()
 *   .withRemoveDefaultServer()
 *   .build();
 *
 * const result = processor.apply(openapiSpec);
 */
class PostProcessorBuilder {
  constructor() {
    /** @private */
    this._transforms = [];
  }

  /**
   * Adds PUT method for all PATCH operations.
   * @returns {PostProcessorBuilder} this (for chaining)
   */
  withPutMethods() {
    this._transforms.push(addPutMethods);
    return this;
  }

  /**
   * Adds HEAD and GET methods to root and metadata paths.
   * @returns {PostProcessorBuilder} this (for chaining)
   */
  withHeadMethods() {
    this._transforms.push(addHeadMethods);
    return this;
  }

  /**
   * Adds If-Match headers to write operations.
   * @returns {PostProcessorBuilder} this (for chaining)
   */
  withIfMatchHeaders() {
    this._transforms.push(addIfMatchHeaders);
    return this;
  }

  /**
   * Adds SAP Gateway standard parameters.
   * @returns {PostProcessorBuilder} this (for chaining)
   */
  withSapParameters() {
    this._transforms.push(addSapParameters);
    return this;
  }

  /**
   * Relaxes $select/$expand/$orderby schemas from array+enum to free-form
   * string so APIM accepts nested/wildcard/combined OData query values.
   * @returns {PostProcessorBuilder} this (for chaining)
   */
  withRelaxedQueryOptions() {
    this._transforms.push(relaxQueryOptionSchemas);
    return this;
  }

  /**
   * Creates placeholder schemas for dangling component schema references.
   * @returns {PostProcessorBuilder} this (for chaining)
   */
  withFixDanglingRefs() {
    this._transforms.push(fixDanglingRefs);
    return this;
  }

  /**
   * Removes default localhost server URLs.
   * @returns {PostProcessorBuilder} this (for chaining)
   */
  withRemoveDefaultServer() {
    this._transforms.push(removeDefaultServer);
    return this;
  }

  /**
   * Adds a custom transform function.
   * @param {function(object): (object|{ spec: object, warnings: string[] })} transformFn - Transform function
   * @returns {PostProcessorBuilder} this (for chaining)
   */
  withCustomTransform(transformFn) {
    if (typeof transformFn !== "function") {
      throw new Error("Custom transform must be a function.");
    }
    this._transforms.push(transformFn);
    return this;
  }

  /**
   * Builds the processor with all configured transforms.
   * @returns {{ apply: function(object|string): object }} Processor with apply method
   */
  build() {
    const transforms = [...this._transforms];

    /**
     * Normalizes the caller input into an OpenAPI object.
     *
     * @param {object|string} openApiSpec - OpenAPI spec object or JSON string
     * @returns {object} Parsed OpenAPI specification
     */
    function parseSpec(openApiSpec) {
      if (openApiSpec === null || openApiSpec === undefined) {
        throw new Error("OpenAPI spec is null or undefined.");
      }

      if (typeof openApiSpec === "string") {
        try {
          return JSON.parse(openApiSpec);
        } catch (err) {
          throw new Error(
            `Failed to parse OpenAPI spec string as JSON: ${err.message}`
          );
        }
      }

      if (typeof openApiSpec === "object" && !Array.isArray(openApiSpec)) {
        return openApiSpec;
      }

      throw new Error(
        `Expected an OpenAPI object or JSON string, received ${typeof openApiSpec}.`
      );
    }

    return {
      /**
       * Applies all configured transforms in sequence.
       *
       * @param {object|string} openApiSpec - OpenAPI spec object or JSON string
       * @returns {object} Fully post-processed OpenAPI specification
       * @throws {Error} If spec is invalid or any transform fails
       */
      apply(openApiSpec) {
        let spec = parseSpec(openApiSpec);

        for (const transform of transforms) {
          spec = transform(spec);
        }

        return spec;
      },
    };
  }

  /**
   * Factory method: creates a builder pre-configured with all standard transforms.
   * This is the default post-processing pipeline matching existing behavior.
   *
   * @returns {PostProcessorBuilder} Builder with all standard transforms
   */
  static standard() {
    return new PostProcessorBuilder()
      .withPutMethods()
      .withHeadMethods()
      .withIfMatchHeaders()
      .withSapParameters()
      .withRelaxedQueryOptions()
      .withFixDanglingRefs()
      .withRemoveDefaultServer();
  }
}

module.exports = { PostProcessorBuilder };
