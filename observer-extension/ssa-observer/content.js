/**
 * SSA Observer Extension - Content Script
 *
 * Phase 24: Trusted Operator Observer
 *
 * This content script is loaded on SSA status pages.
 * The actual extraction logic is injected by the background worker.
 *
 * This file exists primarily for the manifest declaration and
 * can be used for any page-load-time checks if needed.
 */

// Signal that content script is loaded
console.log('[SSA Observer] Content script loaded on:', window.location.href);

// Check for Queue-IT on initial load
if (window.location.hostname.includes('queue') ||
    document.querySelector('iframe[src*="queue-it"]')) {
  console.log('[SSA Observer] Queue-IT detected on page load');
}
