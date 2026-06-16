// +--------------------------------------------------------------
// <copyright file="index.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Public API for the validation module.
// ---------------------------------------------------------------

const { detectFormat, JsonStrategy, XmlStrategy, STRATEGIES } = require("./FormatDetector.js");
const { isSupportedFile, validateExtension, validateFileSize } = require("./validators.js");

module.exports = {
  detectFormat,
  isSupportedFile,
  validateExtension,
  validateFileSize,
  JsonStrategy,
  XmlStrategy,
  STRATEGIES,
};
