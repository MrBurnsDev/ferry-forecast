/**
 * SSA Observer Extension - Background Service Worker
 *
 * Phase 24: SSA Observer Extension
 *
 * Minimal service worker for Manifest V3.
 * Most logic is handled in popup.js.
 */

// Log when service worker starts
console.log('[SSA Observer] Background service worker started');

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[SSA Observer] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[SSA Observer] Extension updated');
  }
});

// Keep service worker alive during API calls if needed
// (Manifest V3 service workers can be terminated after 30s of inactivity)
