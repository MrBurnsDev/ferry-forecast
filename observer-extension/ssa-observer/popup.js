/**
 * Cape Cod Ferry Observer Extension - Popup Script
 *
 * Phase 70: Multi-Operator Observer (SSA + Hy-Line)
 *
 * Handles popup UI interactions:
 * - Save/load OBSERVER_SECRET from chrome.storage.local
 * - Display auto-polling status for each operator
 * - Trigger manual scrape via background worker
 * - Display last poll results and status counts per operator
 * - Tab-based switching between operator results
 */

// DOM elements - Config
const observerSecretInput = document.getElementById('observerSecret');
const saveSecretBtn = document.getElementById('saveSecretBtn');
const autoDot = document.getElementById('autoDot');
const autoStatus = document.getElementById('autoStatus');

// DOM elements - Scrape buttons
const sendBtn = document.getElementById('sendBtn');
const ssaScrapeBtn = document.getElementById('ssaScrapeBtn');
const hylineScrapeBtn = document.getElementById('hylineScrapeBtn');

// DOM elements - Operator tabs
const operatorTabs = document.querySelectorAll('.operator-tab');
const ssaSection = document.getElementById('ssa-section');
const hylineSection = document.getElementById('hyline-section');
const ssaDot = document.getElementById('ssaDot');
const hylineDot = document.getElementById('hylineDot');

// DOM elements - SSA results
const ssaLastPollEl = document.getElementById('ssaLastPoll');
const ssaLastTriggerEl = document.getElementById('ssaLastTrigger');
const ssaLastStatusEl = document.getElementById('ssaLastStatus');
const ssaLastCountEl = document.getElementById('ssaLastCount');
const ssaCountOnTimeEl = document.getElementById('ssaCountOnTime');
const ssaCountCanceledEl = document.getElementById('ssaCountCanceled');
const ssaCountDelayedEl = document.getElementById('ssaCountDelayed');

// DOM elements - Hy-Line results
const hylineLastPollEl = document.getElementById('hylineLastPoll');
const hylineLastTriggerEl = document.getElementById('hylineLastTrigger');
const hylineLastStatusEl = document.getElementById('hylineLastStatus');
const hylineLastCountEl = document.getElementById('hylineLastCount');
const hylineHyNanEl = document.getElementById('hylineHyNan');
const hylineNanHyEl = document.getElementById('hylineNanHy');

// DOM elements - Message
const messageEl = document.getElementById('message');

// Load saved state on popup open
async function init() {
  try {
    // Load observer secret and last results for both operators
    const data = await chrome.storage.local.get([
      'observerSecret',
      'lastPoll',
      'lastResult',
      'pollCount',
      'lastLiveStatusPoll',
      'lastLiveStatusResult',
      'liveStatusPollCount',
      'lastHyLinePoll',
      'lastHyLineResult',
      'hylinePollCount',
      'version',
      'source'
    ]);

    if (data.observerSecret) {
      observerSecretInput.value = data.observerSecret;
      autoDot.classList.remove('inactive');
      autoStatus.textContent = 'Auto-polling active';
    } else {
      autoDot.classList.add('inactive');
      autoStatus.textContent = 'Configure secret to enable';
    }

    // Display SSA last result
    if (data.lastResult) {
      updateSSAResultDisplay(data.lastResult);
    }

    // Display Hy-Line last result
    if (data.lastHyLineResult) {
      updateHyLineResultDisplay(data.lastHyLineResult);
    }

    // Check if alarms are set
    const ssaAlarm = await chrome.alarms.get('ssa_schedule_poll');
    const hylineAlarm = await chrome.alarms.get('hyline_schedule_poll');

    if (data.observerSecret && ssaAlarm) {
      const nextPoll = new Date(ssaAlarm.scheduledTime);
      const now = new Date();
      const minsUntil = Math.max(0, Math.round((nextPoll - now) / 60000));
      autoStatus.textContent = `SSA: ${minsUntil}min, HyLine: ${hylineAlarm ? Math.max(0, Math.round((new Date(hylineAlarm.scheduledTime) - now) / 60000)) : '?'}min`;
    }
  } catch (err) {
    console.error('Failed to load state:', err);
  }
}

// Update SSA display with result data
function updateSSAResultDisplay(result) {
  // Last poll time
  if (result.timestamp) {
    ssaLastPollEl.textContent = formatTime(result.timestamp);
  }

  // Trigger type
  if (result.trigger) {
    ssaLastTriggerEl.textContent = result.trigger === 'auto' ? 'Automatic' : 'Manual';
  }

  // Status
  if (result.success) {
    ssaLastStatusEl.textContent = 'Success';
    ssaLastStatusEl.className = 'status-value success';
    ssaDot.className = 'dot success';
  } else if (result.skipped) {
    ssaLastStatusEl.textContent = 'Skipped';
    ssaLastStatusEl.className = 'status-value skipped';
    ssaDot.className = 'dot pending';
  } else {
    ssaLastStatusEl.textContent = result.error?.substring(0, 30) || 'Error';
    ssaLastStatusEl.className = 'status-value error';
    ssaDot.className = 'dot error';
  }

  // Sailings count
  if (result.schedule_rows_count !== undefined) {
    ssaLastCountEl.textContent = result.schedule_rows_count;
  } else if (result.sailingsCount !== undefined) {
    ssaLastCountEl.textContent = result.sailingsCount;
  } else {
    ssaLastCountEl.textContent = '—';
  }

  // Status counts
  if (result.statusCounts) {
    ssaCountOnTimeEl.textContent = result.statusCounts.on_time ?? '—';
    ssaCountCanceledEl.textContent = result.statusCounts.canceled ?? '—';
    ssaCountDelayedEl.textContent = result.statusCounts.delayed ?? '—';
  }
}

// Update Hy-Line display with result data
function updateHyLineResultDisplay(result) {
  // Last poll time
  if (result.timestamp) {
    hylineLastPollEl.textContent = formatTime(result.timestamp);
  }

  // Trigger type
  if (result.trigger) {
    hylineLastTriggerEl.textContent = result.trigger === 'auto' ? 'Automatic' : 'Manual';
  }

  // Status
  if (result.success) {
    hylineLastStatusEl.textContent = 'Success';
    hylineLastStatusEl.className = 'status-value success';
    hylineDot.className = 'dot success';
  } else {
    hylineLastStatusEl.textContent = result.error?.substring(0, 30) || 'Error';
    hylineLastStatusEl.className = 'status-value error';
    hylineDot.className = 'dot error';
  }

  // Sailings count
  if (result.sailings_count !== undefined) {
    hylineLastCountEl.textContent = result.sailings_count;
  } else {
    hylineLastCountEl.textContent = '—';
  }

  // Direction counts
  if (result.hyannis_to_nantucket !== undefined) {
    hylineHyNanEl.textContent = result.hyannis_to_nantucket;
  }
  if (result.nantucket_to_hyannis !== undefined) {
    hylineNanHyEl.textContent = result.nantucket_to_hyannis;
  }
}

// Format timestamp for display
function formatTime(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' ' + date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
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

// Handle tab switching
operatorTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Remove active from all tabs and sections
    operatorTabs.forEach(t => t.classList.remove('active'));
    ssaSection.classList.remove('active');
    hylineSection.classList.remove('active');

    // Add active to clicked tab and corresponding section
    tab.classList.add('active');
    const operator = tab.dataset.operator;
    if (operator === 'ssa') {
      ssaSection.classList.add('active');
    } else if (operator === 'hyline') {
      hylineSection.classList.add('active');
    }
  });
});

// Save observer secret
saveSecretBtn.addEventListener('click', async () => {
  const secret = observerSecretInput.value.trim();

  if (!secret) {
    showMessage('Please enter the observer secret', 'error');
    return;
  }

  try {
    await chrome.storage.local.set({ observerSecret: secret });
    autoDot.classList.remove('inactive');
    autoStatus.textContent = 'Auto-polling active';
    showMessage('Secret saved - auto-polling enabled', 'success');
  } catch (err) {
    showMessage('Failed to save: ' + err.message, 'error');
  }
});

// Manual scrape all operators
sendBtn.addEventListener('click', async () => {
  hideMessage();

  // Check if secret is configured
  const data = await chrome.storage.local.get(['observerSecret']);
  if (!data.observerSecret) {
    showMessage('Please configure OBSERVER_SECRET first', 'error');
    return;
  }

  // Disable all buttons and show loading
  sendBtn.disabled = true;
  ssaScrapeBtn.disabled = true;
  hylineScrapeBtn.disabled = true;
  sendBtn.innerHTML = '<span class="spinner"></span>Scraping all...';

  try {
    // Send message to background worker
    const result = await chrome.runtime.sendMessage({ action: 'manual_scrape' });

    // Update displays for both operators
    if (result.ssa?.schedule) {
      updateSSAResultDisplay(result.ssa.schedule);
    } else if (result.ssa) {
      updateSSAResultDisplay(result.ssa);
    }

    if (result.hyline) {
      updateHyLineResultDisplay(result.hyline);
    }

    if (result.success) {
      showMessage(`Scraped all operators successfully`, 'success');
    } else {
      const errors = [];
      if (!result.ssa?.success) errors.push('SSA');
      if (!result.hyline?.success) errors.push('Hy-Line');
      showMessage(`Partial failure: ${errors.join(', ')}`, 'warning');
    }
  } catch (err) {
    showMessage('Failed: ' + err.message, 'error');
  } finally {
    sendBtn.disabled = false;
    ssaScrapeBtn.disabled = false;
    hylineScrapeBtn.disabled = false;
    sendBtn.textContent = 'Scrape All Operators';
  }
});

// Manual SSA scrape only
ssaScrapeBtn.addEventListener('click', async () => {
  hideMessage();

  const data = await chrome.storage.local.get(['observerSecret']);
  if (!data.observerSecret) {
    showMessage('Please configure OBSERVER_SECRET first', 'error');
    return;
  }

  ssaScrapeBtn.disabled = true;
  ssaScrapeBtn.innerHTML = '<span class="spinner"></span>SSA...';

  try {
    const result = await chrome.runtime.sendMessage({ action: 'manual_ssa_scrape' });

    if (result.schedule) {
      updateSSAResultDisplay(result.schedule);
    }

    if (result.success) {
      showMessage('SSA scrape complete', 'success');
    } else {
      showMessage(result.error || 'SSA scrape failed', 'error');
    }
  } catch (err) {
    showMessage('Failed: ' + err.message, 'error');
  } finally {
    ssaScrapeBtn.disabled = false;
    ssaScrapeBtn.textContent = 'SSA Only';
  }
});

// Manual Hy-Line scrape only
hylineScrapeBtn.addEventListener('click', async () => {
  hideMessage();

  const data = await chrome.storage.local.get(['observerSecret']);
  if (!data.observerSecret) {
    showMessage('Please configure OBSERVER_SECRET first', 'error');
    return;
  }

  hylineScrapeBtn.disabled = true;
  hylineScrapeBtn.innerHTML = '<span class="spinner"></span>Hy-Line...';

  try {
    const result = await chrome.runtime.sendMessage({ action: 'manual_hyline_scrape' });

    updateHyLineResultDisplay(result);

    if (result.success) {
      showMessage(`Hy-Line: ${result.sailings_count} sailings`, 'success');
    } else {
      showMessage(result.error || 'Hy-Line scrape failed', 'error');
    }
  } catch (err) {
    showMessage('Failed: ' + err.message, 'error');
  } finally {
    hylineScrapeBtn.disabled = false;
    hylineScrapeBtn.textContent = 'Hy-Line Only';
  }
});

// Initialize on load
init();
