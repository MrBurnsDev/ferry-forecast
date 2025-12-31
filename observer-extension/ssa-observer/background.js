/**
 * SSA Observer Extension - Background Service Worker
 *
 * Phase 24: Trusted Operator Observer
 *
 * This service worker handles:
 * 1. Automatic polling every 30 minutes via chrome.alarms
 * 2. Manual trigger from popup
 * 3. Hidden tab scraping of SSA status page
 * 4. POST to Ferry Forecast API
 */

const SSA_STATUS_URL = 'https://www.steamshipauthority.com/traveling_today/status#vineyard_trips';
const API_ENDPOINT = 'https://ferry-forecast.vercel.app/api/operator/status/ingest';
const ALARM_NAME = 'ssa_poll';
const POLL_INTERVAL_MINUTES = 30;

// ============================================================
// ALARM SETUP
// ============================================================

/**
 * Setup polling alarm on install/update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[SSA Observer] Extension ${details.reason}`);

  // Create recurring alarm
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1, // First poll after 1 minute
    periodInMinutes: POLL_INTERVAL_MINUTES
  });

  console.log(`[SSA Observer] Alarm set: every ${POLL_INTERVAL_MINUTES} minutes`);

  // Store install time
  await chrome.storage.local.set({
    installedAt: new Date().toISOString(),
    pollCount: 0
  });
});

/**
 * Handle alarm events
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[SSA Observer] Automatic poll triggered');
    await performScrape('auto');
  }
});

// ============================================================
// MESSAGE HANDLING (from popup)
// ============================================================

/**
 * Handle messages from popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'manual_scrape') {
    console.log('[SSA Observer] Manual scrape requested');
    performScrape('manual').then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'get_status') {
    chrome.storage.local.get(['lastPoll', 'lastResult', 'pollCount']).then(data => {
      sendResponse(data);
    });
    return true;
  }
});

// ============================================================
// CORE SCRAPING LOGIC
// ============================================================

/**
 * Perform the full scrape cycle
 * @param {string} trigger - 'auto' or 'manual'
 */
async function performScrape(trigger) {
  const startTime = Date.now();
  let tabId = null; // Track tab ID for cleanup

  try {
    // Get config
    const config = await chrome.storage.local.get(['observerSecret']);
    if (!config.observerSecret) {
      const result = {
        success: false,
        error: 'OBSERVER_SECRET not configured',
        trigger,
        timestamp: new Date().toISOString()
      };
      await saveResult(result);
      return result;
    }

    // Open hidden tab
    console.log('[SSA Observer] Opening hidden tab...');
    const tab = await chrome.tabs.create({
      url: SSA_STATUS_URL,
      active: false // Hidden tab
    });
    tabId = tab.id; // Save for cleanup in catch block

    // Wait for page load
    await waitForTabLoad(tab.id, 15000);

    // Navigate to #vineyard_trips section - SSA page uses hash navigation
    // The hash in the URL alone may not trigger the JS, so we click the tab link
    console.log('[SSA Observer] Navigating to vineyard_trips section...');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Try clicking the vineyard trips tab link
        const vineyardTab = document.querySelector('a[href="#vineyard_trips"]');
        if (vineyardTab) {
          vineyardTab.click();
          console.log('[SSA Scraper] Clicked vineyard_trips tab');
        } else {
          // Fallback: scroll to the element
          const vineyardTable = document.getElementById('vineyard_trips');
          if (vineyardTable) {
            vineyardTable.scrollIntoView();
            console.log('[SSA Scraper] Scrolled to vineyard_trips');
          }
        }
      }
    });

    // Give time for tab content to load after click
    await new Promise(r => setTimeout(r, 2000));

    // Wait for dynamic content to stabilize (SSA page loads data via JS)
    const rowCount = await waitForContentStable(tab.id, 8);
    console.log(`[SSA Observer] Content ready with ${rowCount} rows`);

    // Inject content script and get data
    console.log('[SSA Observer] Injecting content script...');
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractSSAData
    });

    // Close tab immediately
    await chrome.tabs.remove(tab.id);
    console.log('[SSA Observer] Tab closed');

    if (!results || !results[0] || !results[0].result) {
      throw new Error('Content script returned no data');
    }

    const extractedData = results[0].result;

    // Log the extracted data for debugging
    console.log('[SSA Observer] Extracted data:', JSON.stringify(extractedData, null, 2));

    // Log TRIPS TABLE debug info - this tells us if we found the correct tables
    if (extractedData.tripsTableDebug) {
      console.log('[SSA Observer] TRIPS TABLE DEBUG:', JSON.stringify(extractedData.tripsTableDebug));
    }

    // Log TABLE debug info - critical for understanding page structure
    if (extractedData.tableDebug && extractedData.tableDebug.length > 0) {
      console.log('[SSA Observer] TABLE DEBUG - found', extractedData.tableDebug.length, 'tables:');
      extractedData.tableDebug.forEach((t) => {
        console.log(`  Table ${t.index}: ${t.rowCount} rows, section=${t.sectionId}, dateHeader="${t.dateHeader}", firstRow="${t.firstRowPreview}"`);
      });
    }

    // Log DATE HEADER debug info
    if (extractedData.dateHeadersDebug && extractedData.dateHeadersDebug.length > 0) {
      console.log('[SSA Observer] DATE HEADERS found:');
      extractedData.dateHeadersDebug.forEach((h) => {
        console.log(`  Header ${h.index}: "${h.text}"`);
      });
    }

    // Log debug info if available
    if (extractedData.debugInfo && extractedData.debugInfo.length > 0) {
      console.log('[SSA Observer] Debug info for first rows:');
      extractedData.debugInfo.forEach((info, i) => {
        console.log(`  Row ${i}: statusCellText="${info.statusCellText}", extractedStatus="${info.extractedStatus}"`);
        console.log(`    HTML: ${info.statusCellHtml}`);
      });
    }

    // Check for errors
    if (extractedData.error) {
      throw new Error(extractedData.error);
    }

    if (extractedData.isQueueIT) {
      const result = {
        success: false,
        error: 'Queue-IT waiting room detected',
        skipped: true,
        trigger,
        timestamp: new Date().toISOString()
      };
      console.log('[SSA Observer] Skipped: Queue-IT detected');
      await saveResult(result);
      return result;
    }

    if (!extractedData.sailings || extractedData.sailings.length === 0) {
      const result = {
        success: false,
        error: 'No sailings found on page',
        skipped: true,
        trigger,
        timestamp: new Date().toISOString()
      };
      await saveResult(result);
      return result;
    }

    // Build payload
    const payload = {
      source: 'steamship_authority',
      trigger,
      scraped_at_utc: new Date().toISOString(),
      service_date_local: getLocalDate(),
      timezone: 'America/New_York',
      advisories: extractedData.advisories || [],
      sailings: extractedData.sailings
    };

    // POST to API
    console.log(`[SSA Observer] Sending ${payload.sailings.length} sailings to API...`);
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.observerSecret}`
      },
      body: JSON.stringify(payload)
    });

    // Defensive JSON parsing - handle non-JSON responses gracefully
    let responseData;
    try {
      const responseText = await response.text();
      if (!responseText || responseText.trim() === '') {
        throw new Error(`API returned empty response (HTTP ${response.status})`);
      }
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[SSA Observer] Failed to parse API response:', parseError.message);
      throw new Error(`API returned non-JSON response (HTTP ${response.status})`);
    }

    if (!response.ok || !responseData.success) {
      throw new Error(responseData.error || `HTTP ${response.status}`);
    }

    // Success!
    const duration = Date.now() - startTime;
    const result = {
      success: true,
      trigger,
      sailingsCount: payload.sailings.length,
      advisoriesCount: payload.advisories.length,
      statusCounts: responseData.status_counts,
      duration,
      timestamp: new Date().toISOString()
    };

    console.log(`[SSA Observer] Success: ${payload.sailings.length} sailings in ${duration}ms`);
    await saveResult(result);
    return result;

  } catch (error) {
    // ALWAYS close the tab on error to prevent orphaned tabs
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
        console.log('[SSA Observer] Tab closed after error');
      } catch (closeError) {
        // Tab may already be closed, ignore
        console.log('[SSA Observer] Tab already closed or error closing:', closeError.message);
      }
    }

    const result = {
      success: false,
      error: error.message,
      trigger,
      timestamp: new Date().toISOString()
    };
    console.error('[SSA Observer] Error:', error.message);
    await saveResult(result);
    return result;
  }
}

/**
 * Wait for tab to finish loading
 */
function waitForTabLoad(tabId, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, timeout);

    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // SSA page dynamically loads content - need longer wait
        // Then we'll poll for content to stabilize
        setTimeout(resolve, 5000);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Wait for SSA table content to stabilize (dynamic loading)
 * Polls the page until row count stops changing
 */
async function waitForContentStable(tabId, maxAttempts = 5) {
  let lastRowCount = 0;
  let stableCount = 0;

  for (let i = 0; i < maxAttempts; i++) {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const table = document.getElementById('vineyard_trips');
        return table ? table.querySelectorAll('tr').length : 0;
      }
    });

    const currentRowCount = result[0]?.result || 0;
    console.log(`[SSA Observer] Content check ${i + 1}/${maxAttempts}: ${currentRowCount} rows`);

    if (currentRowCount === lastRowCount && currentRowCount > 15) {
      stableCount++;
      if (stableCount >= 2) {
        console.log(`[SSA Observer] Content stable at ${currentRowCount} rows`);
        return currentRowCount;
      }
    } else {
      stableCount = 0;
    }

    lastRowCount = currentRowCount;

    // Wait 1 second between checks
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[SSA Observer] Content stabilization timeout, proceeding with ${lastRowCount} rows`);
  return lastRowCount;
}

/**
 * Save result to storage
 */
async function saveResult(result) {
  const data = await chrome.storage.local.get(['pollCount']);
  await chrome.storage.local.set({
    lastPoll: result.timestamp,
    lastResult: result,
    pollCount: (data.pollCount || 0) + 1
  });
}

/**
 * Get current local date in YYYY-MM-DD format (Eastern Time)
 */
function getLocalDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

// ============================================================
// CONTENT SCRIPT FUNCTION (injected into SSA page)
// ============================================================

/**
 * Extract SSA status data from the page
 * This function is serialized and injected into the SSA tab
 */
function extractSSAData() {
  // Check for Queue-IT
  const pageText = document.body.innerText.toLowerCase();
  if (
    (pageText.includes('please wait') && pageText.includes('queue')) ||
    document.querySelector('iframe[src*="queue-it"]') ||
    window.location.hostname.includes('queue')
  ) {
    return { isQueueIT: true };
  }

  // Port name normalization
  const portNameMap = {
    'woods hole': 'Woods Hole',
    'vineyard haven': 'Vineyard Haven',
    'oak bluffs': 'Oak Bluffs',
    'hyannis': 'Hyannis',
    'nantucket': 'Nantucket'
  };

  function normalizePortName(name) {
    const lower = name.toLowerCase().trim();
    return portNameMap[lower] || name.trim();
  }

  function normalizeTime(timeStr) {
    return timeStr.trim().replace(/\s+/g, ' ').replace(/am$/i, 'AM').replace(/pm$/i, 'PM');
  }

  /**
   * Extract status from a cell - check multiple sources
   * SSA uses different HTML structures, so we check:
   * 1. Direct innerText
   * 2. CSS classes on the cell or row
   * 3. Image alt text
   * 4. Nested span/div text
   * 5. Color-based detection (red = cancelled)
   */
  function extractStatus(cell, row) {
    // Get all text content from the cell
    const cellText = cell.innerText.trim().toLowerCase();
    const cellHtml = cell.innerHTML.toLowerCase();

    // Check direct text first
    if (cellText.includes('cancel')) return { status: 'canceled', message: cell.innerText.trim() };
    if (cellText.includes('delay')) return { status: 'delayed', message: cell.innerText.trim() };

    // Check CSS classes on cell
    const cellClasses = cell.className.toLowerCase();
    if (cellClasses.includes('cancel') || cellClasses.includes('cancelled')) {
      return { status: 'canceled', message: cell.innerText.trim() || 'Cancelled' };
    }
    if (cellClasses.includes('delay')) {
      return { status: 'delayed', message: cell.innerText.trim() || 'Delayed' };
    }

    // Check CSS classes on row
    const rowClasses = row.className.toLowerCase();
    if (rowClasses.includes('cancel') || rowClasses.includes('cancelled')) {
      return { status: 'canceled', message: cell.innerText.trim() || 'Cancelled' };
    }
    if (rowClasses.includes('delay')) {
      return { status: 'delayed', message: cell.innerText.trim() || 'Delayed' };
    }

    // Check for images with alt text
    const img = cell.querySelector('img');
    if (img) {
      const alt = (img.alt || '').toLowerCase();
      if (alt.includes('cancel') || alt.includes('x') || alt.includes('no')) {
        return { status: 'canceled', message: cell.innerText.trim() || 'Cancelled' };
      }
      if (alt.includes('delay') || alt.includes('warning')) {
        return { status: 'delayed', message: cell.innerText.trim() || 'Delayed' };
      }
    }

    // Check HTML for cancel/delay keywords (catches hidden spans, etc)
    if (cellHtml.includes('cancel')) {
      return { status: 'canceled', message: cell.innerText.trim() || 'Cancelled' };
    }
    if (cellHtml.includes('delay')) {
      return { status: 'delayed', message: cell.innerText.trim() || 'Delayed' };
    }

    // Check computed style - red text often indicates cancellation
    const style = window.getComputedStyle(cell);
    const color = style.color;
    // Red colors: rgb(255, 0, 0), rgb(220, 53, 69), etc
    if (color) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        // If red component is high and green/blue are low, it's likely cancelled
        if (r > 150 && g < 100 && b < 100) {
          return { status: 'canceled', message: cell.innerText.trim() || 'Cancelled' };
        }
      }
    }

    // Default to on_time
    if (cellText.includes('on time') || cellText === '') {
      return { status: 'on_time', message: cell.innerText.trim() || 'On Time' };
    }

    return { status: 'on_time', message: cell.innerText.trim() || 'On Time' };
  }

  function parsePortTimeCell(text) {
    const match = text.match(/^(.+?)\s+at\s+(\d{1,2}:\d{2}\s*[ap]m)$/i);
    if (match) {
      return {
        port: normalizePortName(match[1]),
        time: normalizeTime(match[2])
      };
    }
    return null;
  }

  // Find the TRIPS tables specifically (not the passenger/terminal tables)
  const sailings = [];
  const debugInfo = [];

  // Debug: List ALL element IDs on the page
  const allIds = [...document.querySelectorAll('[id]')].map(el => el.id).filter(id => id);
  console.log('[SSA Scraper] All IDs on page:', allIds.slice(0, 50).join(', '));

  // The trips tables have id="vineyard_trips" and id="nantucket_trips" directly on the <table> element
  const vineyardTripsTable = document.getElementById('vineyard_trips');
  const nantucketTripsTable = document.getElementById('nantucket_trips');

  // Debug: Check what we found
  console.log('[SSA Scraper] vineyard_trips element:', vineyardTripsTable ? {
    tagName: vineyardTripsTable.tagName,
    rowCount: vineyardTripsTable.querySelectorAll('tr').length
  } : 'NOT FOUND');
  console.log('[SSA Scraper] nantucket_trips element:', nantucketTripsTable ? {
    tagName: nantucketTripsTable.tagName,
    rowCount: nantucketTripsTable.querySelectorAll('tr').length
  } : 'NOT FOUND');

  // Collect the trips tables directly (they ARE the tables, not containers)
  let tables = [];
  if (vineyardTripsTable && vineyardTripsTable.tagName === 'TABLE') {
    tables.push(vineyardTripsTable);
    console.log('[SSA Scraper] Added vineyard_trips table with', vineyardTripsTable.querySelectorAll('tr').length, 'rows');
  }
  if (nantucketTripsTable && nantucketTripsTable.tagName === 'TABLE') {
    tables.push(nantucketTripsTable);
    console.log('[SSA Scraper] Added nantucket_trips table with', nantucketTripsTable.querySelectorAll('tr').length, 'rows');
  }

  // Fallback: if trips tables not found, use all tables
  if (tables.length === 0) {
    console.log('[SSA Scraper] Trips tables not found, falling back to all tables');
    tables = [...document.querySelectorAll('table')];
  }

  console.log('[SSA Scraper] Final table count:', tables.length);

  // Debug: Capture table info to return
  const tableDebug = [];
  tables.forEach((table, i) => {
    const parent = table.parentElement;
    const rowCount = table.querySelectorAll('tr').length;
    // Get the date header before this table
    const prevSibling = table.previousElementSibling;
    const dateHeader = prevSibling ? prevSibling.innerText.trim().substring(0, 50) : 'none';
    // Get first row content preview
    const firstRow = table.querySelector('tr td');
    const firstRowPreview = firstRow ? firstRow.innerText.trim().substring(0, 30) : 'none';
    tableDebug.push({
      index: i,
      tableId: table.id || 'no-id',
      rowCount,
      parentTag: parent?.tagName,
      dateHeader,
      firstRowPreview
    });
  });

  // Also capture date headers
  const dateHeadersDebug = [];
  const dateHeaders = document.querySelectorAll('h2, h3, h4, h5');
  dateHeaders.forEach((h, i) => {
    const text = h.innerText.trim();
    if (text.toLowerCase().includes('december') || text.toLowerCase().includes('january') || text.match(/\d{1,2}/) || text.toLowerCase().includes('today') || text.toLowerCase().includes('tomorrow')) {
      dateHeadersDebug.push({ index: i, text: text.substring(0, 50) });
    }
  });

  for (const table of tables) {
    const rows = table.querySelectorAll('tr');

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) continue;

      const departCell = cells[0].innerText.trim();
      const arriveCell = cells[1].innerText.trim();

      // Use enhanced status extraction
      const statusResult = extractStatus(cells[2], row);

      const depart = parsePortTimeCell(departCell);
      const arrive = parsePortTimeCell(arriveCell);

      if (depart && arrive) {
        sailings.push({
          departing_terminal: depart.port,
          arriving_terminal: arrive.port,
          departure_time_local: depart.time,
          arrival_time_local: arrive.time,
          status: statusResult.status,
          status_message: statusResult.message || undefined
        });

        // Debug: capture raw cell info for first few rows
        if (debugInfo.length < 10) {
          debugInfo.push({
            index: sailings.length,
            depart: departCell,
            arrive: arriveCell,
            statusCellText: cells[2].innerText.trim(),
            statusCellHtml: cells[2].innerHTML.substring(0, 200),
            rowClasses: row.className,
            cellClasses: cells[2].className,
            extractedStatus: statusResult.status
          });
        }
      }
    }
  }

  // Extract advisories
  const advisories = [];
  const advisoryElements = document.querySelectorAll('.alert, .notice, .advisory, [class*="alert"], [class*="notice"]');
  for (const el of advisoryElements) {
    const text = el.innerText.trim();
    if (text && text.length > 10) {
      advisories.push({ message: text });
    }
  }

  // Debug info about the trips tables
  const tripsTableDebug = {
    vineyardTripsFound: !!vineyardTripsTable,
    vineyardTripsTagName: vineyardTripsTable?.tagName || 'N/A',
    vineyardTripsRowCount: vineyardTripsTable?.querySelectorAll('tr').length || 0,
    nantucketTripsFound: !!nantucketTripsTable,
    nantucketTripsTagName: nantucketTripsTable?.tagName || 'N/A',
    nantucketTripsRowCount: nantucketTripsTable?.querySelectorAll('tr').length || 0,
    tablesUsedCount: tables.length
  };

  if (sailings.length === 0) {
    return { error: 'No status tables found on page', debugInfo, tableDebug, dateHeadersDebug, allIds: allIds.slice(0, 30), tripsTableDebug };
  }

  return { sailings, advisories, debugInfo, tableDebug, dateHeadersDebug, allIds: allIds.slice(0, 30), tripsTableDebug };
}

console.log('[SSA Observer] Service worker started');
