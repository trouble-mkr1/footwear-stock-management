"use strict";
// Open admin-only destinations requested from the separate Billing page.
// Load AFTER analytics.js and customers-admin.js have attached their handlers.
const adminDestination = new URLSearchParams(window.location.search).get("page");
if (adminDestination === "analytics" || adminDestination === "customers") {
    const destinationId = adminDestination === "analytics" ? "analytics-button" : "customers-button";
    document.getElementById(destinationId)?.click();
}
