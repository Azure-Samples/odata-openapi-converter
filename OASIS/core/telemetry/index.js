// +--------------------------------------------------------------
// <copyright file="index.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

const { TelemetryClient } = require("./TelemetryClient.js");
const { nodeHttpsTransport, fetchTransport } = require("./transports.js");
const { TELEMETRY_FIELDS, buildEventPayload, buildIngestionPayload } = require("./schemas.js");
const { scrubPaths } = require("./scrubber.js");

module.exports = {
  TelemetryClient,
  nodeHttpsTransport,
  fetchTransport,
  TELEMETRY_FIELDS,
  buildEventPayload,
  buildIngestionPayload,
  scrubPaths,
};
