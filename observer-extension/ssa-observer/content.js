/**
 * SSA Observer Extension - Content Script
 *
 * Phase 40: Mobile Schedule Observer
 *
 * This content script is loaded on SSA mobile schedule pages.
 * The actual extraction logic is injected by the background worker.
 *
 * This file exists primarily for the manifest declaration and
 * can be used for any page-load-time checks if needed.
 */

// Signal that content script is loaded
console.log('[SSA Observer] Content script loaded on:', window.location.href);

// Log page structure for debugging
if (window.location.hostname === 'm.steamshipauthority.com') {
  console.log('[SSA Observer] Mobile site detected');

  // Count schedule rows
  const rows = document.querySelectorAll('.row');
  console.log(`[SSA Observer] Found ${rows.length} .row elements on page load`);

  // Check for route tabs
  const vineyardTab = document.querySelector('a[href*="vineyard"], [data-route="vineyard"]');
  const nantucketTab = document.querySelector('a[href*="nantucket"], [data-route="nantucket"]');
  console.log('[SSA Observer] Route tabs:', {
    vineyard: !!vineyardTab,
    nantucket: !!nantucketTab
  });
}
