# SSA Observer Extension

Chrome extension for automatic SSA ferry status polling.

**Phase 24: Trusted Operator Observer**

## Purpose

SSA's website uses Queue-IT to block automated server-side scraping. This extension runs in your browser and automatically polls the SSA status page every 30 minutes using a hidden tab approach.

## How It Works

### Automatic Background Observer (PRIMARY)

The extension automatically:
1. Opens the SSA status page in a hidden background tab
2. Waits for the page to load
3. Injects a content script to extract status data
4. Closes the tab immediately
5. POSTs the data to Ferry Forecast API
6. Repeats every 30 minutes via `chrome.alarms`

**No manual intervention required** - once configured, it runs silently.

### Manual Override (DEBUGGING)

Click "Send SSA Status Now" in the popup to trigger an immediate poll. Useful for:
- Testing after installation
- Forcing an update after Queue-IT session expires
- Debugging extraction issues

## Installation

### 1. Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this folder: `observer-extension/ssa-observer/`
5. The extension icon should appear in your toolbar

### 2. Configure OBSERVER_SECRET

1. Click the SSA Observer extension icon
2. Enter your `OBSERVER_SECRET` (matches the Vercel environment variable)
3. Click **Save Secret**

The secret is stored locally in `chrome.storage.local` and used for Bearer token authentication.

## API Endpoint

**POST** `https://ferry-forecast.vercel.app/api/operator/status/ingest`

### Headers
```
Authorization: Bearer <OBSERVER_SECRET>
Content-Type: application/json
```

### Payload Format
```json
{
  "source": "steamship_authority",
  "trigger": "auto",
  "scraped_at_utc": "2025-12-30T17:35:00.000Z",
  "service_date_local": "2025-12-30",
  "timezone": "America/New_York",
  "advisories": [],
  "sailings": [
    {
      "departing_terminal": "Woods Hole",
      "arriving_terminal": "Vineyard Haven",
      "departure_time_local": "8:35 AM",
      "arrival_time_local": "9:20 AM",
      "status": "on_time",
      "status_message": ""
    },
    {
      "departing_terminal": "Vineyard Haven",
      "arriving_terminal": "Woods Hole",
      "departure_time_local": "9:50 AM",
      "arrival_time_local": "10:35 AM",
      "status": "canceled",
      "status_message": "Cancelled due to Weather conditions"
    }
  ]
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `on_time` | Sailing running as scheduled |
| `canceled` | Sailing cancelled |
| `delayed` | Sailing delayed |

## Popup Display

The popup shows:
- **Auto-polling status**: Active/inactive with next poll countdown
- **Last Result**: Trigger type (Auto/Manual), status, sailings count
- **Status Counts**: On-time, Canceled, Delayed breakdown

## Queue-IT Handling

When Queue-IT is detected (waiting room), the poll is **skipped** and logged. The extension does not attempt to bypass Queue-IT - it simply waits for the next scheduled poll when access may be available.

Detection triggers:
- Page contains "please wait" and "queue"
- Queue-IT iframe present
- Hostname contains "queue"

## Troubleshooting

### "OBSERVER_SECRET not configured"
- Click the extension icon and enter your secret
- Click "Save Secret"

### "Queue-IT waiting room detected"
- The poll was skipped because SSA is showing a waiting room
- Wait for next automatic poll (30 min) or manually navigate to SSA and try again

### "No sailings found on page"
- The page structure may have changed
- Check browser console for errors

### Extension not polling
- Check that the alarm is set: `chrome.alarms.get('ssa_poll')`
- Reinstall the extension to reset alarms

## Files

```
ssa-observer/
├── manifest.json      # Extension manifest (Manifest V3)
├── background.js      # Service worker - alarm setup, scraping logic
├── content.js         # Minimal content script for manifest
├── popup.html         # Popup UI
├── popup.js           # Popup logic - status display, manual trigger
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # This file
```

## Security

- `OBSERVER_SECRET` stored only in `chrome.storage.local`
- Bearer token auth on all API requests
- Server-side rate limiting (1 request per minute per source)
- Extension only has permissions for SSA and Ferry Forecast domains
- All communication over HTTPS

## Testing Checklist

1. [ ] Load extension in Chrome
2. [ ] Enter OBSERVER_SECRET and save
3. [ ] Verify "Auto-polling active" status
4. [ ] Click "Send SSA Status Now" for manual test
5. [ ] Verify success message with sailings count
6. [ ] Check corridor board for status updates
7. [ ] Wait 30 min and verify automatic poll runs
