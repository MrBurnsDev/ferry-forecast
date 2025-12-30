# SSA Observer Extension

Chrome extension for capturing SSA ferry status and sending to Ferry Forecast.

**Phase 24: Single-machine observer for SSA status updates**

## Purpose

SSA's website uses Queue-IT to block automated server-side scraping. This extension runs in YOUR browser (after you've passed through any waiting room) and reads the status table directly from the DOM.

Only YOU (the extension user) can trigger status updates. No automated scraping.

## Installation

### 1. Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this folder: `observer-extension/ssa-observer/`
5. The extension icon (cyan circle) should appear in your toolbar

### 2. Configure API Key

1. Click the SSA Observer extension icon
2. Enter your `STATUS_UPDATE_KEY` in the API Configuration field
3. Click **Save Key**

The key is stored locally in `chrome.storage.local` and never logged or exposed.

## Usage

### Sending Status Updates

1. Navigate to the SSA status page:
   ```
   https://www.steamshipauthority.com/traveling_today/status
   ```

2. **Wait for the page to fully load** (pass through any Queue-IT waiting room if needed)

3. Click the SSA Observer extension icon

4. Click **Send SSA Status Now**

5. The popup will show:
   - Number of sailings found
   - Send success/failure
   - Last sent timestamp

### Verifying Updates

After sending, check the corridor board:
```
https://ferry-forecast.vercel.app/corridor/woods-hole-vineyard-haven
```

Cancellations should now appear with the "Canceled" badge.

## API Payload Format

The extension sends data in this format:

```json
{
  "key": "<STATUS_UPDATE_KEY>",
  "source": "ssa_observer_extension",
  "observed_at_utc": "2025-12-30T17:35:00.000Z",
  "operator_id": "ssa",
  "service_date_local": "2025-12-30",
  "timezone": "America/New_York",
  "boards": [
    {
      "board_id": "vineyard_trips",
      "rows": [
        {
          "depart_port_name": "Woods Hole",
          "arrive_port_name": "Vineyard Haven",
          "depart_time_local": "8:35 AM",
          "arrive_time_local": "9:20 AM",
          "status_text_raw": "Cancelled due to Weather conditions",
          "status_normalized": "canceled"
        }
      ]
    },
    {
      "board_id": "nantucket_trips",
      "rows": [...]
    }
  ],
  "page_meta": {
    "url": "https://www.steamshipauthority.com/traveling_today/status",
    "hash": "a1b2c3d4",
    "user_agent": "Mozilla/5.0...",
    "parse_version": "1.0.0"
  }
}
```

### Status Normalization Rules

| Raw Status Contains | Normalized Value |
|---------------------|------------------|
| "Cancel"            | `canceled`       |
| "Delay"             | `delayed`        |
| "On Time"           | `on_time`        |
| (anything else)     | `unknown`        |

## Troubleshooting

### "No active tab found"
- Make sure you have the SSA page open in the current tab

### "Please navigate to the SSA Traveling Today status page first"
- The extension only works on `steamshipauthority.com/traveling_today`
- Open the correct page before clicking Send

### "SSA is showing a waiting room"
- Wait for Queue-IT to let you through
- Once you see the status table, try again

### "No status tables found on page"
- The page may have a different structure
- Check that the Vineyard/Nantucket trip tables are visible

### "Invalid API key"
- Check that your `STATUS_UPDATE_KEY` matches the one in Vercel environment variables

## Security Notes

- The API key is stored only in `chrome.storage.local` (never in page context)
- Keys are never logged to console in production
- The extension only runs on SSA and Ferry Forecast domains
- All data transmission uses HTTPS

## Files

```
ssa-observer/
├── manifest.json      # Extension manifest (Manifest V3)
├── popup.html         # Popup UI
├── popup.js           # Popup logic + content script injection
├── background.js      # Service worker (minimal)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # This file
```

## Testing Checklist

1. [ ] Load extension in Chrome
2. [ ] Enter API key and save
3. [ ] Open SSA status page
4. [ ] Click "Send SSA Status Now"
5. [ ] Verify success message
6. [ ] Refresh corridor board
7. [ ] Confirm cancellations appear with correct status
