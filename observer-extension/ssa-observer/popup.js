/**
 * SSA Observer Extension - Popup Script
 *
 * Phase 24: Trusted Operator Observer
 *
 * Handles popup UI interactions:
 * - Save/load OBSERVER_SECRET from chrome.storage.local
 * - Display auto-polling status
 * - Trigger manual scrape via background worker
 * - Display last poll results and status counts
 */

// DOM elements
const observerSecretInput = document.getElementById('observerSecret');
const saveSecretBtn = document.getElementById('saveSecretBtn');
const sendBtn = document.getElementById('sendBtn');
const autoDot = document.getElementById('autoDot');
const autoStatus = document.getElementById('autoStatus');
const lastPollEl = document.getElementById('lastPoll');
const lastTriggerEl = document.getElementById('lastTrigger');
const lastStatusEl = document.getElementById('lastStatus');
const lastCountEl = document.getElementById('lastCount');
const countOnTimeEl = document.getElementById('countOnTime');
const countCanceledEl = document.getElementById('countCanceled');
const countDelayedEl = document.getElementById('countDelayed');
const messageEl = document.getElementById('message');

// Load saved state on popup open
async function init() {
  try {
    // Load observer secret and last result
    const data = await chrome.storage.local.get([
      'observerSecret',
      'lastPoll',
      'lastResult',
      'pollCount'
    ]);

    if (data.observerSecret) {
      observerSecretInput.value = data.observerSecret;
      autoDot.classList.remove('inactive');
      autoStatus.textContent = 'Auto-polling active';
    } else {
      autoDot.classList.add('inactive');
      autoStatus.textContent = 'Configure secret to enable';
    }

    // Display last result
    if (data.lastResult) {
      updateResultDisplay(data.lastResult);
    }

    // Check if alarm is set
    const alarm = await chrome.alarms.get('ssa_poll');
    if (alarm) {
      const nextPoll = new Date(alarm.scheduledTime);
      const now = new Date();
      const minsUntil = Math.max(0, Math.round((nextPoll - now) / 60000));
      if (data.observerSecret) {
        autoStatus.textContent = `Next poll in ${minsUntil} min`;
      }
    }
  } catch (err) {
    console.error('Failed to load state:', err);
  }
}

// Update display with result data
function updateResultDisplay(result) {
  // Last poll time
  if (result.timestamp) {
    lastPollEl.textContent = formatTime(result.timestamp);
  }

  // Trigger type
  if (result.trigger) {
    lastTriggerEl.textContent = result.trigger === 'auto' ? 'Automatic' : 'Manual';
  }

  // Status
  if (result.success) {
    lastStatusEl.textContent = 'Success';
    lastStatusEl.className = 'status-value success';
  } else if (result.skipped) {
    lastStatusEl.textContent = 'Skipped';
    lastStatusEl.className = 'status-value skipped';
  } else {
    lastStatusEl.textContent = result.error || 'Error';
    lastStatusEl.className = 'status-value error';
  }

  // Sailings count
  if (result.sailingsCount !== undefined) {
    lastCountEl.textContent = result.sailingsCount;
  } else {
    lastCountEl.textContent = '—';
  }

  // Status counts
  if (result.statusCounts) {
    countOnTimeEl.textContent = result.statusCounts.on_time ?? '—';
    countCanceledEl.textContent = result.statusCounts.canceled ?? '—';
    countDelayedEl.textContent = result.statusCounts.delayed ?? '—';
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

// Manual scrape trigger
sendBtn.addEventListener('click', async () => {
  hideMessage();

  // Check if secret is configured
  const data = await chrome.storage.local.get(['observerSecret']);
  if (!data.observerSecret) {
    showMessage('Please configure OBSERVER_SECRET first', 'error');
    return;
  }

  // Disable button and show loading
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span class="spinner"></span>Scraping...';

  try {
    // Send message to background worker
    const result = await chrome.runtime.sendMessage({ action: 'manual_scrape' });

    // Update display
    updateResultDisplay(result);

    if (result.success) {
      showMessage(`Sent ${result.sailingsCount} sailings in ${result.duration}ms`, 'success');
    } else if (result.skipped) {
      showMessage(result.error || 'Skipped (Queue-IT or no data)', 'warning');
    } else {
      showMessage(result.error || 'Unknown error', 'error');
    }
  } catch (err) {
    showMessage('Failed: ' + err.message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send SSA Status Now';
  }
});

// Initialize on load
init();
