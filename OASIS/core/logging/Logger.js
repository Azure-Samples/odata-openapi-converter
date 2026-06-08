// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Structured logger that wraps Azure Functions InvocationContext logging.
 * Auto-attaches correlationId and computes duration for each log entry.
 * Output is structured JSON that App Insights indexes as custom dimensions.
 */
class Logger {
  /**
   * @param {object} options
   * @param {object} options.context - Azure Functions InvocationContext (has .log, .warn, .error, .info methods)
   * @param {string} options.correlationId - Unique request ID (x-ms-request-id)
   * @param {string} [options.operationName] - Name of the operation (e.g., "convert")
   */
  constructor({ context, correlationId, operationName = "unknown" }) {
    this._context = context;
    this._correlationId = correlationId;
    this._operationName = operationName;
    this._startTime = Date.now();
  }

  /** Returns elapsed time since logger creation in ms */
  get durationMs() {
    return Date.now() - this._startTime;
  }

  /** Base metadata attached to every log entry */
  _meta(extra = {}) {
    return {
      correlationId: this._correlationId,
      operationName: this._operationName,
      durationMs: this.durationMs,
      timestamp: new Date().toISOString(),
      ...extra,
    };
  }

  info(message, properties = {}) {
    this._context.log(message, this._meta(properties));
  }

  warn(message, properties = {}) {
    this._context.warn(message, this._meta(properties));
  }

  error(message, properties = {}) {
    this._context.error(message, this._meta(properties));
  }

  /** Log a successful operation completion */
  success(properties = {}) {
    this.info("Operation completed successfully", { status: 200, ...properties });
  }

  /** Log a failed operation with error details */
  failure(err, statusCode, properties = {}) {
    const isServerError = statusCode >= 500;
    this.error("Operation failed", {
      status: statusCode,
      errorName: err.name,
      errorCode: err.code || "INTERNAL_ERROR",
      // Only include message/stack for server errors (scrubbed)
      ...(isServerError && { errorMessage: err.message, errorStack: err.stack }),
      ...properties,
    });
  }
}

module.exports = { Logger };
