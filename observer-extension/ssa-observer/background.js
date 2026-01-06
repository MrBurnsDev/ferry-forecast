/**
 * Cape Cod Ferry Observer Extension - Background Service Worker
 *
 * Phase 70: Multi-Operator Observer (SSA + Hy-Line)
 *
 * OPERATORS:
 * - Steamship Authority (SSA): Vineyard & Nantucket routes
 * - Hy-Line Cruises: Nantucket high-speed ferry
 *
 * SSA SCRAPERS:
 * - Scraper A (Mobile Schedule): https://m.steamshipauthority.com/#schedule - every 30 min
 * - Scraper B (Desktop Status): https://www.steamshipauthority.com/traveling_today/status - every 3 min
 *
 * HY-LINE SCRAPER:
 * - Schedule Page: https://hylinecruises.com/nantucket-ferry/ - every 30 min
 * - Parses rendered DOM for schedule times (page uses JS rendering)
 *
 * DATABASE MERGE RULES (ABSOLUTE):
 * - Once a sailing is marked canceled in DB: NEVER delete, NEVER revert, NEVER clear reason
 * - If a sailing disappears from operator pages: DO NOTHING (DB remains authoritative)
 * - Only UPDATE when: existing.status != scraped.status
 *
 * FAILURE BEHAVIOR:
 * - If observation fails: report source_type='unavailable'
 * - NEVER fall back to templates
 * - NEVER guess or invent data
 */

// URLs
const SSA_MOBILE_SCHEDULE_URL = 'https://m.steamshipauthority.com/#schedule';
const SSA_DESKTOP_STATUS_URL = 'https://www.steamshipauthority.com/traveling_today/status';
const HYLINE_SCHEDULE_URL = 'https://hylinecruises.com/nantucket-ferry/';
const API_ENDPOINT = 'https://ferry-forecast.vercel.app/api/operator/status/ingest';

// ============================================================
// PHASE 74: CANONICAL DAILY SCHEDULE STORAGE
// ============================================================
// Stores the full daily schedule from Scraper A (mobile) for diff detection.
// When Scraper B (desktop status) runs, we compare against this to find
// sailings that have been REMOVED from the operator's active list.
//
// Key format: "{from_slug}|{to_slug}|{normalized_time}"
// Example: "woods-hole|vineyard-haven|8:35am"
//
// This allows us to detect when SSA removes canceled sailings entirely
// rather than marking them as canceled.
// ============================================================
let canonicalDailySchedule = {
  service_date: null,        // YYYY-MM-DD format
  sailings: new Map(),       // Map<key, sailing_data>
  captured_at: null,         // ISO timestamp
  source: 'mobile_schedule'
};

// Alarms
const SCHEDULE_ALARM_NAME = 'ssa_schedule_poll';     // SSA schedule every 30 min
const LIVE_STATUS_ALARM_NAME = 'ssa_live_status';    // SSA live status every 3 min
const HYLINE_SCHEDULE_ALARM_NAME = 'hyline_schedule_poll'; // Hy-Line schedule every 30 min
const SCHEDULE_POLL_INTERVAL_MINUTES = 30;
const LIVE_STATUS_POLL_INTERVAL_MINUTES = 3;
const HYLINE_POLL_INTERVAL_MINUTES = 30;

// ============================================================
// ALARM SETUP
// ============================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[Ferry Observer] Extension ${details.reason} - Phase 70 Multi-Operator`);

  // SSA Schedule scraper: Full schedule every 30 minutes
  await chrome.alarms.create(SCHEDULE_ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: SCHEDULE_POLL_INTERVAL_MINUTES
  });

  // SSA Live status scraper: Capture reasons every 3 minutes
  await chrome.alarms.create(LIVE_STATUS_ALARM_NAME, {
    delayInMinutes: 0.5,  // Start in 30 seconds
    periodInMinutes: LIVE_STATUS_POLL_INTERVAL_MINUTES
  });

  // Hy-Line Schedule scraper: Every 30 minutes
  await chrome.alarms.create(HYLINE_SCHEDULE_ALARM_NAME, {
    delayInMinutes: 2,  // Stagger after SSA
    periodInMinutes: HYLINE_POLL_INTERVAL_MINUTES
  });

  console.log(`[Ferry Observer] Alarms set: ssa_schedule=${SCHEDULE_POLL_INTERVAL_MINUTES}min, ssa_live=${LIVE_STATUS_POLL_INTERVAL_MINUTES}min, hyline=${HYLINE_POLL_INTERVAL_MINUTES}min`);

  await chrome.storage.local.set({
    installedAt: new Date().toISOString(),
    pollCount: 0,
    liveStatusPollCount: 0,
    hylinePollCount: 0,
    version: '5.0.0',
    source: 'multi_operator'
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SCHEDULE_ALARM_NAME) {
    console.log('[Ferry Observer] SSA SCRAPER A: Canonical schedule poll triggered');
    await performScheduleScrape('auto');
  }

  if (alarm.name === LIVE_STATUS_ALARM_NAME) {
    console.log('[Ferry Observer] SSA SCRAPER B: Live status poll triggered (reason capture)');
    await scrapeLiveOperatorStatus('auto');
  }

  if (alarm.name === HYLINE_SCHEDULE_ALARM_NAME) {
    console.log('[Ferry Observer] HY-LINE: Schedule poll triggered');
    await scrapeHyLineSchedule('auto');
  }
});

// ============================================================
// MESSAGE HANDLING
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'manual_scrape') {
    console.log('[Ferry Observer] Manual full scrape requested (all operators)');
    performFullMultiOperatorScrape('manual').then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'manual_ssa_scrape') {
    console.log('[Ferry Observer] Manual SSA scrape requested');
    performFullDualScrape('manual').then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'manual_hyline_scrape') {
    console.log('[Ferry Observer] Manual Hy-Line scrape requested');
    scrapeHyLineSchedule('manual').then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'manual_live_status') {
    console.log('[Ferry Observer] Manual SSA live status scrape requested');
    scrapeLiveOperatorStatus('manual').then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'get_status') {
    chrome.storage.local.get([
      'lastPoll', 'lastResult', 'pollCount',
      'lastLiveStatusPoll', 'lastLiveStatusResult', 'liveStatusPollCount',
      'lastHyLinePoll', 'lastHyLineResult', 'hylinePollCount',
      'version', 'source'
    ]).then(data => {
      sendResponse(data);
    });
    return true;
  }
});

// ============================================================
// SCRAPER A: CANONICAL SCHEDULE (Mobile)
// Every 30 minutes - full schedule enumeration
// ============================================================

async function performScheduleScrape(trigger) {
  const startTime = Date.now();
  let mobileTabId = null;

  try {
    const config = await chrome.storage.local.get(['observerSecret']);
    if (!config.observerSecret) {
      const result = {
        success: false,
        error: 'OBSERVER_SECRET not configured',
        trigger,
        scraper: 'schedule',
        timestamp: new Date().toISOString()
      };
      await saveScheduleResult(result);
      return result;
    }

    console.log('[SSA Observer] === SCRAPER A: Mobile Schedule ===');

    const mobileTab = await chrome.tabs.create({
      url: SSA_MOBILE_SCHEDULE_URL,
      active: false
    });
    mobileTabId = mobileTab.id;

    await waitForTabLoad(mobileTabId, 20000);
    await waitForMobileContentStable(mobileTabId, 8);

    // Scrape Vineyard
    console.log('[SSA Observer] Scraping Martha\'s Vineyard schedule...');
    const vineyardResults = await chrome.scripting.executeScript({
      target: { tabId: mobileTabId },
      func: extractMobileScheduleData,
      args: ['vineyard']
    });

    // Switch to Nantucket
    await chrome.scripting.executeScript({
      target: { tabId: mobileTabId },
      func: () => {
        const nantucketTab = document.querySelector('a[href="#nantucket"], [data-route="nantucket"], .location_tab:nth-child(2)');
        if (nantucketTab) nantucketTab.click();
      }
    });
    await new Promise(r => setTimeout(r, 2000));

    // Scrape Nantucket
    console.log('[SSA Observer] Scraping Nantucket schedule...');
    const nantucketResults = await chrome.scripting.executeScript({
      target: { tabId: mobileTabId },
      func: extractMobileScheduleData,
      args: ['nantucket']
    });

    await chrome.tabs.remove(mobileTabId);
    mobileTabId = null;

    const vineyardData = vineyardResults?.[0]?.result || { sailings: [] };
    const nantucketData = nantucketResults?.[0]?.result || { sailings: [] };

    const scheduleRows = [
      ...(vineyardData.sailings || []),
      ...(nantucketData.sailings || [])
    ];

    // REGRESSION GUARD: Schedule must have data
    if (scheduleRows.length === 0) {
      console.error('[SSA Observer] REGRESSION: schedule_rows == 0');
      console.error('[SSA Observer] URL: ' + SSA_MOBILE_SCHEDULE_URL);
      console.error('[SSA Observer] Selectors: .row, .departing, .arriving, .status, .location_name, .location_time');

      const result = {
        success: false,
        error: 'REGRESSION: No schedule rows found from mobile',
        trigger,
        scraper: 'schedule',
        timestamp: new Date().toISOString(),
        debug: {
          url: SSA_MOBILE_SCHEDULE_URL,
          selectors: '.row, .departing, .arriving, .status',
          vineyardData,
          nantucketData
        }
      };
      await saveScheduleResult(result);
      return result;
    }

    console.log(`[SSA Observer] Schedule extracted: ${scheduleRows.length} rows`);

    // Phase 74: Update canonical daily schedule for diff detection
    const serviceDate = getLocalDate();
    updateCanonicalSchedule(scheduleRows, serviceDate);

    // Build payload - schedule rows only (reason enrichment happens separately)
    // Phase 76.5: Add request_id for ingest receipt tracking
    const payload = {
      request_id: crypto.randomUUID(),
      source: 'steamship_authority',
      trigger,
      scraper: 'schedule',
      scraped_at_utc: new Date().toISOString(),
      service_date_local: getLocalDate(),
      timezone: 'America/New_York',
      schedule_rows: scheduleRows,
      reason_rows: [],  // Empty - reasons come from live status scraper
      source_meta: {
        schedule_source: 'mobile_schedule',
        schedule_url: SSA_MOBILE_SCHEDULE_URL,
        schedule_count: scheduleRows.length,
        reason_source: 'none',
        reason_count: 0,
        reason_status: 'skipped'
      }
    };

    // POST to API
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.observerSecret}`
      },
      body: JSON.stringify(payload)
    });

    let responseData;
    try {
      const responseText = await response.text();
      if (!responseText) throw new Error('Empty response');
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`API returned non-JSON response (HTTP ${response.status})`);
    }

    if (!response.ok || !responseData.success) {
      throw new Error(responseData.error || `HTTP ${response.status}`);
    }

    const duration = Date.now() - startTime;
    const result = {
      success: true,
      trigger,
      scraper: 'schedule',
      schedule_rows_count: scheduleRows.length,
      statusCounts: responseData.status_counts,
      duration,
      timestamp: new Date().toISOString()
    };

    console.log(`[SSA Observer] Schedule scrape success: ${scheduleRows.length} rows in ${duration}ms`);
    await saveScheduleResult(result);
    return result;

  } catch (error) {
    if (mobileTabId) {
      try { await chrome.tabs.remove(mobileTabId); } catch {}
    }

    const result = {
      success: false,
      error: error.message,
      trigger,
      scraper: 'schedule',
      timestamp: new Date().toISOString()
    };
    console.error('[SSA Observer] Schedule scrape error:', error.message);
    await saveScheduleResult(result);
    return result;
  }
}

// ============================================================
// SCRAPER B: LIVE OPERATOR STATUS (Desktop)
// Every 3 minutes - capture cancellation reasons before disappearance
// ============================================================

/**
 * Phase 42: Live Operator Status Scraper
 *
 * CRITICAL MISSION: Capture cancellation reasons BEFORE sailings disappear.
 * The desktop status page at /traveling_today/status#vineyard_trips is EPHEMERAL:
 * - Sailings DISAPPEAR after their scheduled departure time
 * - Cancellation reasons are LOST if not captured in time
 *
 * This scraper runs every 3 minutes to capture:
 * - Departure terminal
 * - Arrival terminal
 * - Departure time
 * - Status = canceled
 * - Status reason = exact SSA text ("Cancelled due to Trip Consolidation" etc.)
 * - Observed timestamp
 *
 * DOM Selectors (Source B - Desktop Status):
 * - #vineyard_trips table tr (Vineyard route)
 * - #nantucket_trips table tr (Nantucket route)
 * - td cells: departure, arrival, status
 * - Status text containing "Cancelled due to..."
 */
async function scrapeLiveOperatorStatus(trigger) {
  const startTime = Date.now();
  let desktopTabId = null;

  try {
    const config = await chrome.storage.local.get(['observerSecret']);
    if (!config.observerSecret) {
      const result = {
        success: false,
        error: 'OBSERVER_SECRET not configured',
        trigger,
        scraper: 'live_status',
        timestamp: new Date().toISOString()
      };
      await saveLiveStatusResult(result);
      return result;
    }

    console.log('[SSA Observer] === SCRAPER B: Live Operator Status (Reason Capture) ===');
    console.log('[SSA Observer] Target: ' + SSA_DESKTOP_STATUS_URL + '#vineyard_trips');

    const desktopTab = await chrome.tabs.create({
      url: SSA_DESKTOP_STATUS_URL + '#vineyard_trips',
      active: false
    });
    desktopTabId = desktopTab.id;

    // Wait for page - may hit Queue-IT
    await waitForTabLoad(desktopTabId, 25000);
    await new Promise(r => setTimeout(r, 3000));

    // Check for Queue-IT
    const queueCheck = await chrome.scripting.executeScript({
      target: { tabId: desktopTabId },
      func: () => {
        const html = document.body?.innerHTML?.toLowerCase() || '';
        const url = window.location.href.toLowerCase();
        return html.includes('queue') || url.includes('queue-it') || url.includes('q.steamshipauthority');
      }
    });

    if (queueCheck?.[0]?.result) {
      console.log('[SSA Observer] Queue-IT detected, skipping live status scrape');
      await chrome.tabs.remove(desktopTabId);
      desktopTabId = null;

      const result = {
        success: false,
        error: 'Queue-IT waiting room detected',
        trigger,
        scraper: 'live_status',
        timestamp: new Date().toISOString()
      };
      await saveLiveStatusResult(result);
      return result;
    }

    // Scrape the live status page for cancellation reasons AND wind conditions
    console.log('[SSA Observer] Extracting live operator status with reasons...');
    const extractionResult = await chrome.scripting.executeScript({
      target: { tabId: desktopTabId },
      func: extractLiveOperatorStatusData
    });

    // Phase 43: Also extract wind conditions from the page
    console.log('[SSA Observer] Extracting terminal wind conditions...');
    const conditionsResult = await chrome.scripting.executeScript({
      target: { tabId: desktopTabId },
      func: extractWindConditions
    });

    await chrome.tabs.remove(desktopTabId);
    desktopTabId = null;

    const reasonRows = extractionResult?.[0]?.result?.reasons || [];
    const allSailings = extractionResult?.[0]?.result?.all_sailings || [];
    const conditions = conditionsResult?.[0]?.result || [];

    console.log(`[SSA Observer] Live status extracted: ${reasonRows.length} cancellation reasons, ${allSailings.length} total sailings, ${conditions.length} terminal conditions`);

    // Phase 74: Detect removed sailings by comparing active list to canonical schedule
    const serviceDate = getLocalDate();
    const removedSailings = detectRemovedSailings(allSailings, serviceDate);

    if (removedSailings.length > 0) {
      console.log(`[Phase 74] ${removedSailings.length} removed sailings will be included in payload`);
    }

    // Build payload with reason rows AND conditions (Phase 43)
    // Phase 74: Include removed sailings with sailing_origin marker
    // Combine active sailings with removed sailings (which have sailing_origin: 'operator_removed')
    const allScheduleRows = [...allSailings, ...removedSailings];

    // Phase 76.5: Add request_id for ingest receipt tracking
    const payload = {
      request_id: crypto.randomUUID(),
      source: 'steamship_authority',
      trigger,
      scraper: 'live_status',
      scraped_at_utc: new Date().toISOString(),
      service_date_local: getLocalDate(),
      timezone: 'America/New_York',
      schedule_rows: allScheduleRows,  // Phase 74: Active sailings + removed sailings
      reason_rows: reasonRows,          // Only cancelled sailings with reasons
      // Phase 43: Include terminal wind conditions
      conditions: conditions,
      source_meta: {
        schedule_source: 'desktop_status',
        schedule_url: SSA_DESKTOP_STATUS_URL,
        schedule_count: allSailings.length,
        reason_source: 'desktop_status',
        reason_url: SSA_DESKTOP_STATUS_URL + '#vineyard_trips',
        reason_count: reasonRows.length,
        reason_status: 'success',
        conditions_count: conditions.length,
        // Phase 74: Track removed sailings separately in metadata
        removed_sailings_count: removedSailings.length
      }
    };

    // POST to API
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.observerSecret}`
      },
      body: JSON.stringify(payload)
    });

    let responseData;
    try {
      const responseText = await response.text();
      if (!responseText) throw new Error('Empty response');
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`API returned non-JSON response (HTTP ${response.status})`);
    }

    if (!response.ok || !responseData.success) {
      throw new Error(responseData.error || `HTTP ${response.status}`);
    }

    const duration = Date.now() - startTime;
    const result = {
      success: true,
      trigger,
      scraper: 'live_status',
      reason_rows_count: reasonRows.length,
      all_sailings_count: allSailings.length,
      // Phase 74: Track removed sailings separately
      removed_sailings_count: removedSailings.length,
      reasons_applied: responseData.reasons_applied || 0,
      statusCounts: responseData.status_counts,
      duration,
      timestamp: new Date().toISOString()
    };

    // Phase 74: Log removed sailings if any were detected
    if (removedSailings.length > 0) {
      console.log(`[SSA Observer] Phase 74: ${removedSailings.length} removed sailings detected and sent`);
    }
    console.log(`[SSA Observer] Live status scrape success: ${reasonRows.length} reasons, ${removedSailings.length} removed sailings in ${duration}ms`);
    await saveLiveStatusResult(result);
    return result;

  } catch (error) {
    if (desktopTabId) {
      try { await chrome.tabs.remove(desktopTabId); } catch {}
    }

    const result = {
      success: false,
      error: error.message,
      trigger,
      scraper: 'live_status',
      timestamp: new Date().toISOString()
    };
    console.error('[SSA Observer] Live status scrape error:', error.message);
    await saveLiveStatusResult(result);
    return result;
  }
}

/**
 * Full dual scrape (manual trigger only)
 * Runs both scrapers in sequence
 */
async function performFullDualScrape(trigger) {
  console.log('[SSA Observer] Running full dual scrape...');

  const scheduleResult = await performScheduleScrape(trigger);
  const liveStatusResult = await scrapeLiveOperatorStatus(trigger);

  return {
    success: scheduleResult.success && liveStatusResult.success,
    schedule: scheduleResult,
    liveStatus: liveStatusResult,
    trigger,
    timestamp: new Date().toISOString()
  };
}

// ============================================================
// TAB HELPERS
// ============================================================

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
        setTimeout(resolve, 3000);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitForMobileContentStable(tabId, maxAttempts = 5) {
  let lastRowCount = 0;
  let stableCount = 0;

  for (let i = 0; i < maxAttempts; i++) {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.querySelectorAll('.row, .schedule-row, [class*="trip"]').length
    });

    const currentRowCount = result[0]?.result || 0;
    console.log(`[SSA Observer] Content check ${i + 1}/${maxAttempts}: ${currentRowCount} rows`);

    if (currentRowCount === lastRowCount && currentRowCount > 5) {
      stableCount++;
      if (stableCount >= 2) {
        console.log(`[SSA Observer] Content stable at ${currentRowCount} rows`);
        return currentRowCount;
      }
    } else {
      stableCount = 0;
    }

    lastRowCount = currentRowCount;
    await new Promise(r => setTimeout(r, 1000));
  }

  return lastRowCount;
}

async function saveScheduleResult(result) {
  const data = await chrome.storage.local.get(['pollCount']);
  await chrome.storage.local.set({
    lastPoll: result.timestamp,
    lastResult: result,
    pollCount: (data.pollCount || 0) + 1
  });
}

async function saveLiveStatusResult(result) {
  const data = await chrome.storage.local.get(['liveStatusPollCount']);
  await chrome.storage.local.set({
    lastLiveStatusPoll: result.timestamp,
    lastLiveStatusResult: result,
    liveStatusPollCount: (data.liveStatusPollCount || 0) + 1
  });
}

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
// PHASE 74: SAILING KEY GENERATION & DIFF DETECTION
// ============================================================

/**
 * Generate port slug from port name
 * Matches the backend generateSailingKey logic
 */
function portNameToSlug(portName) {
  const slugMap = {
    'woods hole': 'woods-hole',
    'vineyard haven': 'vineyard-haven',
    'oak bluffs': 'oak-bluffs',
    'hyannis': 'hyannis',
    'nantucket': 'nantucket'
  };
  const lower = (portName || '').toLowerCase().trim();
  return slugMap[lower] || lower.replace(/\s+/g, '-');
}

/**
 * Normalize time for key generation
 * "8:35 AM" -> "8:35am"
 * Matches the backend normalizeTime logic
 */
function normalizeTimeForKey(timeStr) {
  if (!timeStr) return '';
  return timeStr
    .toLowerCase()
    .replace(/\s+/g, '')  // Remove all whitespace
    .replace(/^0+/, '');   // Remove leading zeros
}

/**
 * Generate canonical sailing key
 * Format: "{from_slug}|{to_slug}|{normalized_time}"
 * Example: "woods-hole|vineyard-haven|8:35am"
 */
function generateSailingKey(sailing) {
  const fromSlug = portNameToSlug(sailing.departing_terminal);
  const toSlug = portNameToSlug(sailing.arriving_terminal);
  const normalizedTime = normalizeTimeForKey(sailing.departure_time_local);
  return `${fromSlug}|${toSlug}|${normalizedTime}`;
}

/**
 * Phase 74: Update canonical daily schedule from Scraper A (mobile)
 *
 * Called after successful mobile schedule scrape.
 * Stores all sailings for the day so we can detect removals later.
 */
function updateCanonicalSchedule(sailings, serviceDate) {
  // If it's a new day, clear the old schedule
  if (canonicalDailySchedule.service_date !== serviceDate) {
    console.log(`[Phase 74] New service date ${serviceDate}, clearing old canonical schedule`);
    canonicalDailySchedule.sailings.clear();
    canonicalDailySchedule.service_date = serviceDate;
  }

  // Add/update sailings in canonical schedule
  let newCount = 0;
  let updateCount = 0;

  for (const sailing of sailings) {
    const key = generateSailingKey(sailing);

    if (!canonicalDailySchedule.sailings.has(key)) {
      newCount++;
    } else {
      updateCount++;
    }

    canonicalDailySchedule.sailings.set(key, {
      ...sailing,
      key,
      first_seen_at: canonicalDailySchedule.sailings.get(key)?.first_seen_at || new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    });
  }

  canonicalDailySchedule.captured_at = new Date().toISOString();

  console.log(`[Phase 74] Canonical schedule updated: ${canonicalDailySchedule.sailings.size} total sailings (${newCount} new, ${updateCount} updated)`);
}

/**
 * Phase 74: Detect removed sailings by comparing active list to canonical schedule
 *
 * Returns sailings that were in the canonical schedule but are NOT in the active list.
 * These are sailings SSA has removed from the page (likely canceled).
 *
 * RULE: Only detect removals for sailings that haven't departed yet.
 * Sailings naturally disappear after their departure time.
 */
function detectRemovedSailings(activeSailings, serviceDate) {
  // If no canonical schedule or different day, we can't detect removals
  if (canonicalDailySchedule.service_date !== serviceDate) {
    console.log(`[Phase 74] No canonical schedule for ${serviceDate}, skipping removal detection`);
    return [];
  }

  if (canonicalDailySchedule.sailings.size === 0) {
    console.log('[Phase 74] Canonical schedule is empty, skipping removal detection');
    return [];
  }

  // Build set of active sailing keys
  const activeKeys = new Set(activeSailings.map(s => generateSailingKey(s)));

  // Find sailings in canonical but NOT in active
  const removed = [];
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  for (const [key, sailing] of canonicalDailySchedule.sailings) {
    // Skip if sailing is in active list
    if (activeKeys.has(key)) continue;

    // Parse departure time to check if it's in the past
    const timeStr = sailing.departure_time_local || '';
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2]);
      const isPM = timeMatch[3].toUpperCase() === 'PM';

      // Convert to 24-hour
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;

      // Skip sailings that have already departed (natural removal)
      // Use 15-minute grace period
      const sailingMinutes = hour * 60 + minute;
      const currentMinutes = currentHour * 60 + currentMinute;

      if (sailingMinutes + 15 < currentMinutes) {
        // Sailing departed more than 15 minutes ago, natural removal
        continue;
      }
    }

    // This sailing was in canonical but is now missing from active list
    // and hasn't departed yet - this is a REMOVAL
    removed.push({
      ...sailing,
      status: 'canceled',
      status_reason: 'Removed from operator schedule',
      sailing_origin: 'operator_removed',
      removed_detected_at: new Date().toISOString()
    });

    console.log(`[Phase 74] REMOVED SAILING DETECTED: ${sailing.departing_terminal} -> ${sailing.arriving_terminal} @ ${sailing.departure_time_local}`);
  }

  if (removed.length > 0) {
    console.log(`[Phase 74] Total removed sailings detected: ${removed.length}`);
  }

  return removed;
}

// ============================================================
// SOURCE A: Mobile Schedule Extraction
// ============================================================

/**
 * Extract schedule data from SSA mobile page
 *
 * DOM Selectors (Source A - Mobile Schedule):
 * - div.row (one per sailing)
 *   - span.departing > span.location_name, span.location_time
 *   - span.arriving > span.location_name, span.location_time
 *   - span.status (may not have reason text)
 */
function extractMobileScheduleData(route) {
  const sailings = [];

  const portNameMap = {
    'woods hole': 'Woods Hole',
    'vineyard haven': 'Vineyard Haven',
    'oak bluffs': 'Oak Bluffs',
    'hyannis': 'Hyannis',
    'nantucket': 'Nantucket'
  };

  function normalizePortName(name) {
    const lower = (name || '').toLowerCase().trim();
    return portNameMap[lower] || name?.trim() || 'Unknown';
  }

  function normalizeTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.trim()
      .replace(/\s+/g, ' ')
      .replace(/am$/i, 'AM')
      .replace(/pm$/i, 'PM');
  }

  function extractStatus(statusCell, row) {
    if (!statusCell) {
      return { status: 'on_time', status_reason: null };
    }

    const cellText = (statusCell.textContent || '').trim().toLowerCase();
    const cellHtml = (statusCell.innerHTML || '').toLowerCase();
    const rowClasses = (row?.className || '').toLowerCase();

    if (cellText.includes('cancel') || rowClasses.includes('cancel') || cellHtml.includes('cancel')) {
      const fullText = (statusCell.textContent || '').trim();
      const hasReason = fullText.toLowerCase().includes('due to') || fullText.length > 20;
      return {
        status: 'canceled',
        status_reason: hasReason ? fullText : null
      };
    }

    if (cellText.includes('delay') || rowClasses.includes('delay')) {
      const fullText = (statusCell.textContent || '').trim();
      return { status: 'delayed', status_reason: fullText || null };
    }

    const img = statusCell.querySelector('img');
    if (img) {
      const alt = (img.alt || '').toLowerCase();
      if (alt.includes('cancel')) {
        return { status: 'canceled', status_reason: null };
      }
      if (alt.includes('delay')) {
        return { status: 'delayed', status_reason: null };
      }
    }

    return { status: 'on_time', status_reason: null };
  }

  const rows = document.querySelectorAll('.row');
  console.log(`[SSA Scraper] Found ${rows.length} .row elements for ${route}`);

  for (const row of rows) {
    try {
      const departSpan = row.querySelector('.departing');
      const arriveSpan = row.querySelector('.arriving');
      const statusSpan = row.querySelector('.status');

      if (!departSpan || !arriveSpan) continue;

      const departPort = departSpan.querySelector('.location_name')?.textContent?.trim();
      const departTime = departSpan.querySelector('.location_time')?.textContent?.trim();
      const arrivePort = arriveSpan.querySelector('.location_name')?.textContent?.trim();
      const arriveTime = arriveSpan.querySelector('.location_time')?.textContent?.trim();

      if (!departPort || !departTime || !arrivePort) continue;

      const statusResult = extractStatus(statusSpan, row);

      sailings.push({
        departing_terminal: normalizePortName(departPort),
        arriving_terminal: normalizePortName(arrivePort),
        departure_time_local: normalizeTime(departTime),
        arrival_time_local: normalizeTime(arriveTime) || undefined,
        status: statusResult.status,
        status_reason: statusResult.status_reason
      });
    } catch (err) {
      console.error('[SSA Scraper] Row parse error:', err.message);
    }
  }

  console.log(`[SSA Scraper] Extracted ${sailings.length} sailings for ${route}`);

  if (sailings.length === 0) {
    return { error: `No sailings found for ${route}`, rowCount: rows.length };
  }

  return { sailings };
}

// ============================================================
// SOURCE B: Desktop Live Status Extraction
// ============================================================

/**
 * Extract LIVE operator status with cancellation reasons from desktop page
 *
 * CRITICAL: This captures the ephemeral cancellation reasons before sailings disappear!
 *
 * DOM Selectors (Source B - Desktop Status):
 * - #vineyard_trips table, #nantucket_trips table
 * - tr rows with td cells for departure, arrival, status
 * - Status text: "Cancelled due to Trip Consolidation", "Cancelled due to Weather conditions", etc.
 *
 * URL: https://www.steamshipauthority.com/traveling_today/status#vineyard_trips
 */
function extractLiveOperatorStatusData() {
  const reasons = [];
  const all_sailings = [];

  const portNameMap = {
    'woods hole': 'Woods Hole',
    'vineyard haven': 'Vineyard Haven',
    'oak bluffs': 'Oak Bluffs',
    'hyannis': 'Hyannis',
    'nantucket': 'Nantucket'
  };

  function normalizePortName(name) {
    const lower = (name || '').toLowerCase().trim();
    return portNameMap[lower] || name?.trim() || 'Unknown';
  }

  function normalizeTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.trim()
      .replace(/\s+/g, ' ')
      .replace(/am$/i, 'AM')
      .replace(/pm$/i, 'PM');
  }

  /**
   * Extract status and reason from cell text
   * Looks for patterns like:
   * - "Cancelled due to Trip Consolidation"
   * - "Cancelled due to Weather conditions"
   * - "Cancelled due to Mechanical issues"
   */
  function extractStatusAndReason(text) {
    const lowerText = text.toLowerCase();

    // Check for cancellation with reason
    if (lowerText.includes('cancelled') || lowerText.includes('canceled')) {
      // Extract the full reason text
      const reasonMatch = text.match(/cancel+ed\s+(due\s+to\s+.+)/i);
      const reason = reasonMatch ? `Cancelled ${reasonMatch[1]}` : text;

      return {
        status: 'canceled',
        status_reason: reason.trim()
      };
    }

    // Check for delay
    if (lowerText.includes('delay')) {
      return {
        status: 'delayed',
        status_reason: text.trim()
      };
    }

    // On time or other
    return {
      status: 'on_time',
      status_reason: null
    };
  }

  // Try to find route-specific tables
  const routeIds = ['vineyard_trips', 'nantucket_trips'];

  for (const routeId of routeIds) {
    const routeSection = document.getElementById(routeId);
    if (!routeSection) {
      console.log(`[SSA Scraper] Route section #${routeId} not found`);
      continue;
    }

    const tables = routeSection.querySelectorAll('table');
    console.log(`[SSA Scraper] Found ${tables.length} tables in #${routeId}`);

    for (const table of tables) {
      const rows = table.querySelectorAll('tr');

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;

        try {
          // Parse cells - typical format: Departure, Arrival, Status
          let departPort = null;
          let arrivePort = null;
          let departTime = null;
          let arriveTime = null;
          let statusText = '';

          for (const cell of cells) {
            const text = cell.textContent.trim();

            // Try to find time patterns
            const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(AM|PM)?)/i);
            if (timeMatch) {
              if (!departTime) {
                departTime = normalizeTime(timeMatch[0]);
              } else if (!arriveTime) {
                arriveTime = normalizeTime(timeMatch[0]);
              }
            }

            // Try to find port names
            const lowerText = text.toLowerCase();
            for (const port of Object.keys(portNameMap)) {
              if (lowerText.includes(port)) {
                if (!departPort) {
                  departPort = portNameMap[port];
                } else if (!arrivePort && portNameMap[port] !== departPort) {
                  arrivePort = portNameMap[port];
                }
              }
            }

            // Check for status text
            if (lowerText.includes('cancel') || lowerText.includes('delay') || lowerText.includes('on time')) {
              statusText = text;
            }
          }

          if (departPort && departTime) {
            const statusResult = extractStatusAndReason(statusText);

            const sailing = {
              departing_terminal: departPort,
              arriving_terminal: arrivePort || 'Unknown',
              departure_time_local: departTime,
              arrival_time_local: arriveTime || undefined,
              status: statusResult.status,
              status_reason: statusResult.status_reason
            };

            all_sailings.push(sailing);

            // Add to reasons array if it has a cancellation reason
            if (statusResult.status === 'canceled' && statusResult.status_reason) {
              reasons.push({
                departing_terminal: departPort,
                arriving_terminal: arrivePort || 'Unknown',
                departure_time_local: departTime,
                status_reason: statusResult.status_reason
              });
            }
          }
        } catch (err) {
          console.error('[SSA Scraper] Row parse error:', err.message);
        }
      }
    }
  }

  // Fallback: Try to find any table with sailing-like content
  if (all_sailings.length === 0) {
    console.log('[SSA Scraper] No route sections found, trying fallback selectors...');

    const allTables = document.querySelectorAll('table');
    for (const table of allTables) {
      const rows = table.querySelectorAll('tr');

      for (const row of rows) {
        const text = row.textContent;

        // Check if row looks like a sailing (has port names and times)
        const hasPort = Object.keys(portNameMap).some(p => text.toLowerCase().includes(p));
        const hasTime = /\d{1,2}:\d{2}\s*(AM|PM)/i.test(text);
        const hasStatus = /cancel|delay|on.time/i.test(text);

        if (hasPort && hasTime) {
          const cells = row.querySelectorAll('td');
          let departPort = null;
          let arrivePort = null;
          let departTime = null;
          let statusText = '';

          for (const cell of cells) {
            const cellText = cell.textContent.trim();
            const lowerCellText = cellText.toLowerCase();

            // Find time
            const timeMatch = cellText.match(/(\d{1,2}:\d{2}\s*(AM|PM)?)/i);
            if (timeMatch && !departTime) {
              departTime = normalizeTime(timeMatch[0]);
            }

            // Find ports
            for (const port of Object.keys(portNameMap)) {
              if (lowerCellText.includes(port)) {
                if (!departPort) {
                  departPort = portNameMap[port];
                } else if (!arrivePort && portNameMap[port] !== departPort) {
                  arrivePort = portNameMap[port];
                }
              }
            }

            // Find status
            if (lowerCellText.includes('cancel') || lowerCellText.includes('delay')) {
              statusText = cellText;
            }
          }

          if (departPort && departTime) {
            const statusResult = extractStatusAndReason(statusText);

            const sailing = {
              departing_terminal: departPort,
              arriving_terminal: arrivePort || 'Unknown',
              departure_time_local: departTime,
              status: statusResult.status,
              status_reason: statusResult.status_reason
            };

            all_sailings.push(sailing);

            if (statusResult.status === 'canceled' && statusResult.status_reason) {
              reasons.push({
                departing_terminal: departPort,
                arriving_terminal: arrivePort || 'Unknown',
                departure_time_local: departTime,
                status_reason: statusResult.status_reason
              });
            }
          }
        }
      }
    }
  }

  console.log(`[SSA Scraper] Live status extracted: ${reasons.length} cancellation reasons, ${all_sailings.length} total sailings`);
  return { reasons, all_sailings };
}

// ============================================================
// WIND CONDITIONS EXTRACTION (Phase 43)
// ============================================================

/**
 * Extract wind conditions from SSA desktop status page
 *
 * SSA displays wind conditions on the traveling_today/status page.
 * This captures the wind exactly as SSA shows it to users.
 *
 * Returns array of condition objects for each terminal detected.
 */
function extractWindConditions() {
  const conditions = [];
  const sourceUrl = window.location.href;

  // Terminal slug mapping
  const terminalNameToSlug = {
    'woods hole': 'woods-hole',
    'vineyard haven': 'vineyard-haven',
    'oak bluffs': 'oak-bluffs',
    'hyannis': 'hyannis',
    'nantucket': 'nantucket'
  };

  // Cardinal direction to degrees mapping
  const directionToDegrees = {
    'N': 0, 'NNE': 22, 'NE': 45, 'ENE': 67,
    'E': 90, 'ESE': 112, 'SE': 135, 'SSE': 157,
    'S': 180, 'SSW': 202, 'SW': 225, 'WSW': 247,
    'W': 270, 'WNW': 292, 'NW': 315, 'NNW': 337
  };

  /**
   * Parse wind text like "WSW 3 mph" or "Wind: NE 12 mph"
   */
  function parseWindText(text) {
    if (!text) return null;

    // Match patterns like "WSW 3 mph", "NE 12", "Wind: S 8 mph"
    const windPattern = /([NSEW]{1,3})\s*(\d+(?:\.\d+)?)\s*(?:mph|MPH)?/i;
    const match = text.match(windPattern);

    if (!match) return null;

    const direction = match[1].toUpperCase();
    const speed = parseFloat(match[2]);

    return {
      wind_speed_mph: speed,
      wind_direction_text: direction,
      wind_direction_degrees: directionToDegrees[direction] || null,
      raw_wind_text: text.trim()
    };
  }

  // Try to find wind info in various locations on the page
  // SSA may display wind in weather section, header, or near route tables

  // Strategy 1: Look for elements with "wind" in text content
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    const text = el.textContent || '';
    const lowerText = text.toLowerCase();

    // Only check leaf nodes or small text blocks
    if (el.children.length > 5) continue;
    if (text.length > 200) continue;

    if (lowerText.includes('wind') || /[NSEW]{1,3}\s+\d+\s*mph/i.test(text)) {
      const parsed = parseWindText(text);
      if (parsed && parsed.wind_speed_mph !== null) {
        // Determine which terminal this applies to based on context
        // Default to both WH and VH for vineyard trips section
        const parentSection = el.closest('#vineyard_trips, #nantucket_trips, .weather, .conditions');

        let terminalSlugs = [];
        if (parentSection?.id === 'nantucket_trips') {
          terminalSlugs = ['hyannis', 'nantucket'];
        } else {
          // Default: apply to Woods Hole and Vineyard Haven
          terminalSlugs = ['woods-hole', 'vineyard-haven'];
        }

        for (const slug of terminalSlugs) {
          conditions.push({
            terminal_slug: slug,
            wind_speed_mph: parsed.wind_speed_mph,
            wind_direction_text: parsed.wind_direction_text,
            wind_direction_degrees: parsed.wind_direction_degrees,
            raw_wind_text: parsed.raw_wind_text,
            source_url: sourceUrl,
            notes: terminalSlugs.length > 1 ? 'Single wind value applied to both terminals' : null
          });
        }

        // Only capture first wind value found to avoid duplicates
        break;
      }
    }
  }

  console.log(`[SSA Scraper] Extracted ${conditions.length} terminal conditions`);
  return conditions;
}

// ============================================================
// HY-LINE SCHEDULE SCRAPER
// Phase 70: Multi-Operator Observer
// ============================================================

/**
 * Scrape Hy-Line schedule from their website
 *
 * PHASE 70 SSA-PARITY CONTRACT:
 * - Uses same ingestion endpoint as SSA
 * - Source type: 'operator_scraped'
 * - operator_id: 'hy-line-cruises'
 * - Direction MUST be derived from page content, not guessed
 * - If observation fails: report unavailable, NEVER guess
 *
 * URL: https://hylinecruises.com/nantucket-ferry/
 */
async function scrapeHyLineSchedule(trigger) {
  const startTime = Date.now();
  let tabId = null;

  try {
    const config = await chrome.storage.local.get(['observerSecret']);
    if (!config.observerSecret) {
      const result = {
        success: false,
        error: 'OBSERVER_SECRET not configured',
        trigger,
        scraper: 'hyline_schedule',
        operator: 'hy-line-cruises',
        timestamp: new Date().toISOString()
      };
      await saveHyLineResult(result);
      return result;
    }

    console.log('[Ferry Observer] === HY-LINE: Schedule Scrape ===');
    console.log('[Ferry Observer] Target: ' + HYLINE_SCHEDULE_URL);

    // Create tab and navigate to Hy-Line schedule page
    const tab = await chrome.tabs.create({
      url: HYLINE_SCHEDULE_URL,
      active: false
    });
    tabId = tab.id;

    // Wait for page load
    await waitForTabLoad(tabId, 25000);

    // Wait for JS-rendered content to stabilize
    await waitForHyLineContentStable(tabId, 8);

    // Extract schedule data from DOM
    console.log('[Ferry Observer] Extracting Hy-Line schedule from DOM...');
    const extractionResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractHyLineScheduleData
    });

    await chrome.tabs.remove(tabId);
    tabId = null;

    const data = extractionResult?.[0]?.result;

    if (!data || data.error) {
      console.error('[Ferry Observer] HY-LINE: Extraction failed -', data?.error || 'No data returned');

      const result = {
        success: false,
        error: data?.error || 'DOM extraction returned no data',
        trigger,
        scraper: 'hyline_schedule',
        operator: 'hy-line-cruises',
        timestamp: new Date().toISOString(),
        debug: data?.debug || null
      };
      await saveHyLineResult(result);
      return result;
    }

    const sailings = data.sailings || [];

    // REGRESSION GUARD: Must have sailings
    if (sailings.length === 0) {
      console.error('[Ferry Observer] HY-LINE REGRESSION: sailings.length == 0');
      console.error('[Ferry Observer] URL:', HYLINE_SCHEDULE_URL);
      console.error('[Ferry Observer] Debug:', JSON.stringify(data.debug));

      const result = {
        success: false,
        error: 'REGRESSION: No sailings found from Hy-Line page',
        trigger,
        scraper: 'hyline_schedule',
        operator: 'hy-line-cruises',
        timestamp: new Date().toISOString(),
        debug: data.debug
      };
      await saveHyLineResult(result);
      return result;
    }

    console.log(`[Ferry Observer] HY-LINE: Extracted ${sailings.length} sailings`);

    // Build payload matching SSA format
    // Phase 76.5: Add request_id for ingest receipt tracking
    const payload = {
      request_id: crypto.randomUUID(),
      source: 'hy_line_cruises',
      trigger,
      scraper: 'hyline_schedule',
      scraped_at_utc: new Date().toISOString(),
      service_date_local: getLocalDate(),
      timezone: 'America/New_York',
      schedule_rows: sailings,
      reason_rows: [],  // Hy-Line doesn't publish reasons like SSA
      conditions: [],   // No terminal conditions from Hy-Line
      source_meta: {
        schedule_source: 'hyline_nantucket_ferry',
        schedule_url: HYLINE_SCHEDULE_URL,
        schedule_count: sailings.length,
        reason_source: 'none',
        reason_count: 0,
        reason_status: 'not_applicable',
        operator_id: 'hy-line-cruises'
      }
    };

    // POST to API (same endpoint as SSA)
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.observerSecret}`
      },
      body: JSON.stringify(payload)
    });

    let responseData;
    try {
      const responseText = await response.text();
      if (!responseText) throw new Error('Empty response');
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`API returned non-JSON response (HTTP ${response.status})`);
    }

    if (!response.ok || !responseData.success) {
      throw new Error(responseData.error || `HTTP ${response.status}`);
    }

    const duration = Date.now() - startTime;
    const result = {
      success: true,
      trigger,
      scraper: 'hyline_schedule',
      operator: 'hy-line-cruises',
      sailings_count: sailings.length,
      hyannis_to_nantucket: data.hyannis_to_nantucket_count || 0,
      nantucket_to_hyannis: data.nantucket_to_hyannis_count || 0,
      statusCounts: responseData.status_counts,
      duration,
      timestamp: new Date().toISOString()
    };

    console.log(`[Ferry Observer] HY-LINE: Schedule scrape success - ${sailings.length} sailings in ${duration}ms`);
    await saveHyLineResult(result);
    return result;

  } catch (error) {
    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }

    const result = {
      success: false,
      error: error.message,
      trigger,
      scraper: 'hyline_schedule',
      operator: 'hy-line-cruises',
      timestamp: new Date().toISOString()
    };
    console.error('[Ferry Observer] HY-LINE: Schedule scrape error:', error.message);
    await saveHyLineResult(result);
    return result;
  }
}

/**
 * Wait for Hy-Line page content to stabilize
 * The page uses JavaScript to render schedule data
 */
async function waitForHyLineContentStable(tabId, maxAttempts = 8) {
  let lastContentHash = '';
  let stableCount = 0;

  for (let i = 0; i < maxAttempts; i++) {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Look for schedule-related content
        const scheduleElements = document.querySelectorAll(
          '.schedule, .departure, .ferry-schedule, [class*="schedule"], ' +
          'table, .time, [class*="departure"], [class*="trip"]'
        );

        // Also check for time patterns in body text
        const bodyText = document.body?.innerText || '';
        const timeMatches = bodyText.match(/\d{1,2}:\d{2}\s*(AM|PM)/gi) || [];

        return {
          elementCount: scheduleElements.length,
          timeCount: timeMatches.length,
          contentHash: `${scheduleElements.length}-${timeMatches.length}`
        };
      }
    });

    const data = result[0]?.result;
    const currentHash = data?.contentHash || '';

    console.log(`[Ferry Observer] HY-LINE: Content check ${i + 1}/${maxAttempts}: ${data?.elementCount} elements, ${data?.timeCount} times`);

    if (currentHash === lastContentHash && data?.timeCount >= 3) {
      stableCount++;
      if (stableCount >= 2) {
        console.log(`[Ferry Observer] HY-LINE: Content stable with ${data?.timeCount} time entries`);
        return data;
      }
    } else {
      stableCount = 0;
    }

    lastContentHash = currentHash;
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('[Ferry Observer] HY-LINE: Content stabilization timeout, proceeding with extraction');
  return null;
}

/**
 * Extract schedule data from Hy-Line page DOM
 *
 * CRITICAL REQUIREMENTS (Phase 70 SSA-Parity):
 * - Direction MUST be derived from page content semantically
 * - Port names must match exactly: "Hyannis", "Nantucket"
 * - Times must include AM/PM
 * - NO regex guessing for direction
 * - If direction cannot be determined, mark sailing as invalid
 */
function extractHyLineScheduleData() {
  const sailings = [];
  const debug = {
    url: window.location.href,
    pageTitle: document.title,
    selectors_tried: [],
    elements_found: {},
    raw_times: []
  };

  // Port normalization
  const normalizePortName = (name) => {
    const lower = (name || '').toLowerCase().trim();
    if (lower.includes('hyannis')) return 'Hyannis';
    if (lower.includes('nantucket')) return 'Nantucket';
    return null;
  };

  // Time normalization
  const normalizeTime = (timeStr) => {
    if (!timeStr) return null;
    return timeStr.trim()
      .replace(/\s+/g, ' ')
      .replace(/am$/i, 'AM')
      .replace(/pm$/i, 'PM');
  };

  // Strategy 1: Look for structured schedule sections with direction headers
  const scheduleSelectors = [
    '.schedule-section',
    '.ferry-schedule',
    '[class*="schedule"]',
    '.departure-list',
    'section',
    '.content-section'
  ];

  for (const selector of scheduleSelectors) {
    debug.selectors_tried.push(selector);
    const sections = document.querySelectorAll(selector);
    debug.elements_found[selector] = sections.length;
  }

  // Strategy 2: Look for direction indicators in the page structure
  // Hy-Line typically has sections like "Hyannis to Nantucket" and "Nantucket to Hyannis"
  const allText = document.body?.innerText || '';

  // Find sections that indicate direction
  const hyannisToNantucketPatterns = [
    /hyannis\s+to\s+nantucket/gi,
    /departing\s+hyannis/gi,
    /from\s+hyannis/gi,
    /hyannis\s*→\s*nantucket/gi,
    /hyannis\s*->\s*nantucket/gi
  ];

  const nantucketToHyannisPatterns = [
    /nantucket\s+to\s+hyannis/gi,
    /departing\s+nantucket/gi,
    /from\s+nantucket/gi,
    /nantucket\s*→\s*hyannis/gi,
    /nantucket\s*->\s*hyannis/gi
  ];

  // Strategy 3: Parse tables for schedule data
  const tables = document.querySelectorAll('table');
  debug.elements_found['tables'] = tables.length;

  for (const table of tables) {
    const tableText = table.innerText || '';
    const tableLower = tableText.toLowerCase();

    // Determine direction from table context
    let direction = null;
    let fromPort = null;
    let toPort = null;

    // Check parent elements for direction context
    let parent = table.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const parentText = (parent.innerText || '').toLowerCase();

      if (hyannisToNantucketPatterns.some(p => p.test(parentText))) {
        fromPort = 'Hyannis';
        toPort = 'Nantucket';
        direction = 'hy-nan';
        break;
      }
      if (nantucketToHyannisPatterns.some(p => p.test(parentText))) {
        fromPort = 'Nantucket';
        toPort = 'Hyannis';
        direction = 'nan-hy';
        break;
      }
      parent = parent.parentElement;
    }

    // Extract times from table rows
    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('td, th');
      for (const cell of cells) {
        const cellText = cell.innerText || '';
        const timeMatch = cellText.match(/(\d{1,2}:\d{2}\s*(AM|PM))/i);

        if (timeMatch && direction) {
          const time = normalizeTime(timeMatch[1]);
          if (time) {
            debug.raw_times.push({ time, direction, source: 'table' });
            sailings.push({
              departing_terminal: fromPort,
              arriving_terminal: toPort,
              departure_time_local: time,
              status: 'on_time',
              status_reason: null
            });
          }
        }
      }
    }
  }

  // Strategy 4: If no tables, look for list-based schedules
  if (sailings.length === 0) {
    // Look for elements containing time patterns near direction indicators
    const allElements = document.querySelectorAll('div, li, p, span');

    for (const el of allElements) {
      const text = el.innerText || '';
      if (text.length > 500) continue; // Skip large containers

      // Check if this element or nearby elements indicate direction
      let direction = null;
      let fromPort = null;
      let toPort = null;

      // Check element and its parent context for direction
      const contextText = (el.innerText + (el.parentElement?.innerText || '')).toLowerCase();

      if (/hyannis\s+(to|→|->)\s+nantucket/i.test(contextText) ||
          /departing\s+hyannis/i.test(contextText) ||
          /from\s+hyannis/i.test(contextText)) {
        fromPort = 'Hyannis';
        toPort = 'Nantucket';
        direction = 'hy-nan';
      } else if (/nantucket\s+(to|→|->)\s+hyannis/i.test(contextText) ||
                 /departing\s+nantucket/i.test(contextText) ||
                 /from\s+nantucket/i.test(contextText)) {
        fromPort = 'Nantucket';
        toPort = 'Hyannis';
        direction = 'nan-hy';
      }

      if (direction) {
        // Extract times from this element
        const timeMatches = text.match(/\d{1,2}:\d{2}\s*(AM|PM)/gi) || [];
        for (const timeStr of timeMatches) {
          const time = normalizeTime(timeStr);
          if (time && !debug.raw_times.some(t => t.time === time && t.direction === direction)) {
            debug.raw_times.push({ time, direction, source: 'list' });
            sailings.push({
              departing_terminal: fromPort,
              arriving_terminal: toPort,
              departure_time_local: time,
              status: 'on_time',
              status_reason: null
            });
          }
        }
      }
    }
  }

  // Deduplicate sailings
  const seen = new Set();
  const uniqueSailings = sailings.filter(s => {
    const key = `${s.departing_terminal}-${s.arriving_terminal}-${s.departure_time_local}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Count by direction
  const hyannisToNantucket = uniqueSailings.filter(s =>
    s.departing_terminal === 'Hyannis' && s.arriving_terminal === 'Nantucket'
  );
  const nantucketToHyannis = uniqueSailings.filter(s =>
    s.departing_terminal === 'Nantucket' && s.arriving_terminal === 'Hyannis'
  );

  console.log(`[HY-LINE Scraper] Extracted ${uniqueSailings.length} sailings: ${hyannisToNantucket.length} HY→NAN, ${nantucketToHyannis.length} NAN→HY`);

  if (uniqueSailings.length === 0) {
    return {
      error: 'No sailings found with determinable direction',
      debug
    };
  }

  return {
    sailings: uniqueSailings,
    hyannis_to_nantucket_count: hyannisToNantucket.length,
    nantucket_to_hyannis_count: nantucketToHyannis.length,
    debug
  };
}

/**
 * Save Hy-Line scrape result to storage
 */
async function saveHyLineResult(result) {
  const data = await chrome.storage.local.get(['hylinePollCount']);
  await chrome.storage.local.set({
    lastHyLinePoll: result.timestamp,
    lastHyLineResult: result,
    hylinePollCount: (data.hylinePollCount || 0) + 1
  });
}

/**
 * Perform full multi-operator scrape (all operators)
 * Used for manual "Scrape All" button
 */
async function performFullMultiOperatorScrape(trigger) {
  console.log('[Ferry Observer] Running full multi-operator scrape...');

  // Run SSA dual scrape first
  const ssaResult = await performFullDualScrape(trigger);

  // Then run Hy-Line scrape
  const hylineResult = await scrapeHyLineSchedule(trigger);

  return {
    success: ssaResult.success && hylineResult.success,
    ssa: ssaResult,
    hyline: hylineResult,
    trigger,
    operators_scraped: ['steamship-authority', 'hy-line-cruises'],
    timestamp: new Date().toISOString()
  };
}

console.log('[Ferry Observer] Phase 70 Multi-Operator Service Worker started');
