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

const SSA_STATUS_URL = 'https://www.steamshipauthority.com/traveling_today/status';
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

    // Wait for page load
    await waitForTabLoad(tab.id, 15000);

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
        // Extra delay for JS rendering
        setTimeout(resolve, 2000);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
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

  function normalizeStatus(statusText) {
    const lower = statusText.toLowerCase();
    if (lower.includes('cancel')) return 'canceled';
    if (lower.includes('delay')) return 'delayed';
    if (lower.includes('on time') || lower === '') return 'on_time';
    return 'on_time';
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

  // Find all status tables
  const sailings = [];
  const tables = document.querySelectorAll('table');

  for (const table of tables) {
    const rows = table.querySelectorAll('tr');

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) continue;

      const departCell = cells[0].innerText.trim();
      const arriveCell = cells[1].innerText.trim();
      const statusCell = cells[2].innerText.trim();

      const depart = parsePortTimeCell(departCell);
      const arrive = parsePortTimeCell(arriveCell);

      if (depart && arrive) {
        sailings.push({
          departing_terminal: depart.port,
          arriving_terminal: arrive.port,
          departure_time_local: depart.time,
          arrival_time_local: arrive.time,
          status: normalizeStatus(statusCell),
          status_message: statusCell || undefined
        });
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

  if (sailings.length === 0) {
    return { error: 'No status tables found on page' };
  }

  return { sailings, advisories };
}

console.log('[SSA Observer] Service worker started');
