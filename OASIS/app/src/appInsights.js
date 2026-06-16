// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

import { ApplicationInsights } from "@microsoft/applicationinsights-web";

const connectionString = import.meta.env.VITE_APPLICATIONINSIGHTS_CONNECTION_STRING || "";

let appInsights = null;

if (connectionString) {
  appInsights = new ApplicationInsights({
    config: {
      connectionString,
      enableAutoRouteTracking: true,
      enableUnhandledPromiseRejectionTracking: true,
      enableAjaxErrorStatusText: true,
      disableFetchTracking: false,
      enableCorsCorrelation: true,
      // Correlate with backend via x-ms-request-id
      correlationHeaderExcludedDomains: [],
    },
  });
  appInsights.loadAppInsights();
}

/**
 * Track a custom event with properties.
 * No-op if App Insights is not configured.
 */
export function trackEvent(name, properties = {}) {
  appInsights?.trackEvent({ name }, properties);
}

/**
 * Track an exception.
 */
export function trackException(error, properties = {}) {
  appInsights?.trackException({ exception: error }, properties);
}

/**
 * Set the correlation ID from an API response for linking frontend/backend traces.
 */
export function setCorrelationId(requestId) {
  if (appInsights && requestId) {
    appInsights.context.session.id = requestId;
  }
}

export { appInsights };
export default appInsights;
