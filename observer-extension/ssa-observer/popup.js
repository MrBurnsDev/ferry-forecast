/**
 * SSA Observer Extension - Popup Script
 *
 * Phase 24: SSA Observer Extension
 *
 * Handles popup UI interactions:
 * - Save/load API key from chrome.storage.local
 * - Trigger content script to parse SSA page
 * - Display last sent time and result
 */

const API_ENDPOINT = 'https://ferry-forecast.vercel.app/api/status/update';

// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const sendBtn = document.getElementById('sendBtn');
const lastSentEl = document.getElementById('lastSent');
const lastStatusEl = document.getElementById('lastStatus');
const lastRowCountEl = document.getElementById('lastRowCount');
const rowCountEl = document.getElementById('rowCount');
const messageEl = document.getElementById('message');

// Load saved state on popup open
async function init() {
  try {
    const data = await chrome.storage.local.get(['apiKey', 'lastSent', 'lastStatus', 'lastRowCount']);

    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }

    if (data.lastSent) {
      lastSentEl.textContent = formatTime(data.lastSent);
    }

    if (data.lastStatus) {
      lastStatusEl.textContent = data.lastStatus;
      lastStatusEl.className = 'status-value ' + (data.lastStatus === 'Success' ? 'success' : 'error');
    }

    if (data.lastRowCount !== undefined) {
      lastRowCountEl.textContent = data.lastRowCount;
    }
  } catch (err) {
    console.error('Failed to load state:', err);
  }
}

// Format timestamp for display
function formatTime(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch {
    return 'Unknown';
  }
}

// Show message in popup
function showMessage(text, type = 'error') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.classList.remove('hidden');

  // Auto-hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      messageEl.classList.add('hidden');
    }, 5000);
  }
}

// Hide message
function hideMessage() {
  messageEl.classList.add('hidden');
}

// Save API key
saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();

  if (!key) {
    showMessage('Please enter an API key', 'error');
    return;
  }

  try {
    await chrome.storage.local.set({ apiKey: key });
    showMessage('API key saved', 'success');
  } catch (err) {
    showMessage('Failed to save key: ' + err.message, 'error');
  }
});

// Send SSA status
sendBtn.addEventListener('click', async () => {
  hideMessage();

  // Get API key
  const data = await chrome.storage.local.get(['apiKey']);
  const apiKey = data.apiKey;

  if (!apiKey) {
    showMessage('Please set your API key first', 'error');
    return;
  }

  // Disable button and show loading
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span class="spinner"></span>Parsing page...';

  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      throw new Error('No active tab found');
    }

    // Check if we're on the SSA page
    if (!tab.url || !tab.url.includes('steamshipauthority.com/traveling_today')) {
      throw new Error('Please navigate to the SSA Traveling Today status page first');
    }

    // Inject and execute content script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: parseSSAPage
    });

    if (!results || !results[0]) {
      throw new Error('Failed to parse page');
    }

    const parseResult = results[0].result;

    // Check for Queue-IT or errors
    if (parseResult.error) {
      throw new Error(parseResult.error);
    }

    if (parseResult.isQueueIT) {
      throw new Error('SSA is showing a waiting room. Try again when the status table is visible.');
    }

    // Show row count
    const totalRows = parseResult.boards.reduce((sum, b) => sum + b.rows.length, 0);
    rowCountEl.textContent = `Found ${totalRows} sailings across ${parseResult.boards.length} boards`;
    rowCountEl.classList.remove('hidden');

    // Update button
    sendBtn.innerHTML = '<span class="spinner"></span>Sending...';

    // Build payload
    const payload = {
      key: apiKey,
      source: 'ssa_observer_extension',
      observed_at_utc: new Date().toISOString(),
      operator_id: 'ssa',
      service_date_local: getLocalDate(),
      timezone: 'America/New_York',
      boards: parseResult.boards,
      page_meta: {
        url: tab.url,
        hash: parseResult.hash,
        user_agent: navigator.userAgent,
        parse_version: '1.0.0'
      }
    };

    // Send to API
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.success) {
      throw new Error(responseData.error || `HTTP ${response.status}`);
    }

    // Success! Save state
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      lastSent: now,
      lastStatus: 'Success',
      lastRowCount: totalRows
    });

    // Update UI
    lastSentEl.textContent = formatTime(now);
    lastStatusEl.textContent = 'Success';
    lastStatusEl.className = 'status-value success';
    lastRowCountEl.textContent = totalRows;

    showMessage(`Sent ${totalRows} sailings successfully!`, 'success');

  } catch (err) {
    // Save error state
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      lastSent: now,
      lastStatus: 'Error',
      lastRowCount: 0
    });

    lastSentEl.textContent = formatTime(now);
    lastStatusEl.textContent = 'Error';
    lastStatusEl.className = 'status-value error';
    lastRowCountEl.textContent = '0';

    showMessage(err.message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send SSA Status Now';
  }
});

// Get current local date in YYYY-MM-DD format (Eastern Time)
function getLocalDate() {
  const now = new Date();
  // Format in Eastern time
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
}

/**
 * Content script function - injected into the SSA page
 * Parses the status tables and returns structured data
 */
function parseSSAPage() {
  // Check for Queue-IT waiting room
  const pageText = document.body.innerText.toLowerCase();
  if (
    pageText.includes('please wait') && pageText.includes('queue') ||
    document.querySelector('iframe[src*="queue-it"]') ||
    window.location.hostname.includes('queue')
  ) {
    return { isQueueIT: true };
  }

  // Port name normalization map
  const portNameMap = {
    'woods hole': 'Woods Hole',
    'vineyard haven': 'Vineyard Haven',
    'oak bluffs': 'Oak Bluffs',
    'hyannis': 'Hyannis',
    'nantucket': 'Nantucket'
  };

  // Normalize port name
  function normalizePortName(name) {
    const lower = name.toLowerCase().trim();
    return portNameMap[lower] || name.trim();
  }

  // Normalize time to "h:mm AM/PM" format
  function normalizeTime(timeStr) {
    return timeStr
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/am$/i, 'AM')
      .replace(/pm$/i, 'PM');
  }

  // Normalize status
  function normalizeStatus(statusText) {
    const lower = statusText.toLowerCase();
    if (lower.includes('cancel')) return 'canceled';
    if (lower.includes('delay')) return 'delayed';
    if (lower.includes('on time')) return 'on_time';
    return 'unknown';
  }

  // Parse a cell like "Woods Hole at 8:35 am" into port and time
  function parsePortTimeCell(text) {
    // Pattern: "Port Name at H:MM am/pm"
    const match = text.match(/^(.+?)\s+at\s+(\d{1,2}:\d{2}\s*[ap]m)$/i);
    if (match) {
      return {
        port: normalizePortName(match[1]),
        time: normalizeTime(match[2])
      };
    }
    return null;
  }

  // Find and parse a board by anchor ID
  function parseBoard(anchorId) {
    const rows = [];

    // Find the section by ID or look for heading containing the text
    let section = document.getElementById(anchorId);

    // If no exact ID, try to find by class or content
    if (!section) {
      // Try finding by anchor name
      const anchors = document.querySelectorAll(`a[name="${anchorId}"], a[id="${anchorId}"]`);
      if (anchors.length > 0) {
        section = anchors[0];
      }
    }

    // Find the table within/after this section
    let table = null;

    if (section) {
      // Look for table after the anchor
      let el = section;
      while (el && !table) {
        if (el.tagName === 'TABLE') {
          table = el;
        } else {
          table = el.querySelector('table');
        }
        el = el.nextElementSibling;
      }
    }

    // Fallback: find tables with trip data
    if (!table) {
      const tables = document.querySelectorAll('table');
      for (const t of tables) {
        const text = t.innerText.toLowerCase();
        if (anchorId === 'vineyard_trips' && (text.includes('vineyard') || text.includes('woods hole'))) {
          if (!text.includes('nantucket') || text.includes('vineyard')) {
            table = t;
            break;
          }
        }
        if (anchorId === 'nantucket_trips' && text.includes('nantucket')) {
          table = t;
          break;
        }
      }
    }

    if (!table) {
      return rows;
    }

    // Parse table rows
    const tableRows = table.querySelectorAll('tr');

    for (const tr of tableRows) {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 3) continue;

      const departCell = cells[0].innerText.trim();
      const arriveCell = cells[1].innerText.trim();
      const statusCell = cells[2].innerText.trim();

      const depart = parsePortTimeCell(departCell);
      const arrive = parsePortTimeCell(arriveCell);

      if (depart && arrive) {
        rows.push({
          depart_port_name: depart.port,
          arrive_port_name: arrive.port,
          depart_time_local: depart.time,
          arrive_time_local: arrive.time,
          status_text_raw: statusCell,
          status_normalized: normalizeStatus(statusCell)
        });
      }
    }

    return rows;
  }

  // Parse both boards
  const boards = [];

  const vineyardRows = parseBoard('vineyard_trips');
  if (vineyardRows.length > 0) {
    boards.push({
      board_id: 'vineyard_trips',
      rows: vineyardRows
    });
  }

  const nantucketRows = parseBoard('nantucket_trips');
  if (nantucketRows.length > 0) {
    boards.push({
      board_id: 'nantucket_trips',
      rows: nantucketRows
    });
  }

  // Generate hash of table content for deduplication
  const allText = boards.map(b => b.rows.map(r =>
    `${r.depart_port_name}|${r.depart_time_local}|${r.arrive_port_name}|${r.status_normalized}`
  ).join('\n')).join('\n');

  // Simple hash (not crypto, just for change detection)
  let hash = 0;
  for (let i = 0; i < allText.length; i++) {
    const char = allText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  if (boards.length === 0) {
    return { error: 'No status tables found on page. Make sure you are on the SSA Traveling Today page.' };
  }

  return {
    boards,
    hash: Math.abs(hash).toString(16)
  };
}

// Initialize on load
init();
