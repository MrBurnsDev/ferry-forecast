# SSA Observer Extension

Chrome extension for automatic SSA ferry status polling.

**Phase 41: Dual-Source Observer**

## Purpose

SSA's desktop website uses Queue-IT to block automated server-side scraping. The desktop **live terminal view** also REMOVES cancelled sailings after trip consolidation, causing Ferry Forecast to lose track of cancellations.

**The Problem**: The mobile schedule (`m.steamshipauthority.com/#schedule`) retains cancelled sailings but does NOT reliably include cancellation reasons (e.g., "Cancelled due to Trip Consolidation"). The desktop status page has the reasons but is behind Queue-IT and removes consolidated trips.

**The Solution**: Dual-source ingestion:
- **Source A** (Mobile Schedule): Canonical list of ALL sailings + status
- **Source B** (Desktop Status): Enriches with cancellation reasons when accessible

This extension scrapes BOTH sources and sends both datasets to the API for server-side merge.

## How It Works

### Automatic Background Observer (PRIMARY)

The extension automatically:
1. Opens `https://m.steamshipauthority.com/#schedule` in a hidden background tab
2. Waits for the page to load
3. Clicks route tabs (Vineyard, Nantucket) to load each schedule
4. Extracts ALL sailings including cancelled ones (**Source A**)
5. Closes the mobile tab
6. Opens `https://www.steamshipauthority.com/traveling_today/status` (**Source B**)
7. If no Queue-IT, extracts cancellation reasons
8. Sends BOTH datasets to Ferry Forecast API for server-side merge
9. Repeats every 30 minutes via `chrome.alarms`

**No manual intervention required** - once configured, it runs silently.

### Merge Rules (Server-Side)

The API merges Source A and Source B using these rules:
1. **Source A is truth** for sailing existence and status
2. **Source B enriches** status_reason on matching rows
3. **Never overwrite** non-empty status_reason with empty/null
4. **Natural key** for matching: `from_port|to_port|departure_time`

### What Gets Captured

For each sailing:
- `operator_id`: "ssa"
- `corridor_id`: "vineyard" or "nantucket"
- `from_port`: Origin terminal (e.g., "Woods Hole")
- `to_port`: Destination terminal (e.g., "Vineyard Haven")
- `service_date`: Today's date (YYYY-MM-DD)
- `departure_time`: Scheduled departure (e.g., "8:35 AM")
- `status`: "on_time", "canceled", or "delayed"
- `status_reason`: Verbatim reason (e.g., "Cancelled due to Trip Consolidation")

### Manual Override (DEBUGGING)

Click "Send SSA Status Now" in the popup to trigger an immediate poll. Useful for:
- Testing after installation
- Forcing an update
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

### Payload Format (Phase 41 - Dual Source)
```json
{
  "source": "steamship_authority",
  "trigger": "auto",
  "scraped_at_utc": "2026-01-01T12:00:00.000Z",
  "service_date_local": "2026-01-01",
  "timezone": "America/New_York",
  "schedule_rows": [
    {
      "departing_terminal": "Woods Hole",
      "arriving_terminal": "Vineyard Haven",
      "departure_time_local": "7:00 AM",
      "arrival_time_local": "7:45 AM",
      "status": "on_time",
      "status_reason": null
    },
    {
      "departing_terminal": "Woods Hole",
      "arriving_terminal": "Vineyard Haven",
      "departure_time_local": "8:35 AM",
      "arrival_time_local": "9:20 AM",
      "status": "canceled",
      "status_reason": null
    }
  ],
  "reason_rows": [
    {
      "departing_terminal": "Woods Hole",
      "arriving_terminal": "Vineyard Haven",
      "departure_time_local": "8:35 AM",
      "status_reason": "Cancelled due to Trip Consolidation"
    }
  ],
  "source_meta": {
    "schedule_source": "mobile",
    "schedule_url": "https://m.steamshipauthority.com/#schedule",
    "schedule_count": 2,
    "reason_source": "desktop",
    "reason_url": "https://www.steamshipauthority.com/traveling_today/status",
    "reason_count": 1,
    "reason_status": "success"
  }
}
```

**After server-side merge**, the 8:35 AM sailing will have `status_reason: "Cancelled due to Trip Consolidation"`.

### Legacy Payload Format (Still Supported)
```json
{
  "source": "steamship_authority",
  "trigger": "auto",
  "scraped_at_utc": "2026-01-01T12:00:00.000Z",
  "service_date_local": "2026-01-01",
  "timezone": "America/New_York",
  "sailings": [
    {
      "departing_terminal": "Woods Hole",
      "arriving_terminal": "Vineyard Haven",
      "departure_time_local": "8:35 AM",
      "status": "canceled",
      "status_message": "Cancelled due to Trip Consolidation"
    }
  ]
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `on_time` | Sailing running as scheduled |
| `canceled` | Sailing cancelled (reason preserved) |
| `delayed` | Sailing delayed |

### Common Cancellation Reasons

- "Cancelled due to Trip Consolidation"
- "Cancelled due to Weather conditions"
- "Cancelled due to Mechanical issues"

## DOM Selectors (Phase 40)

The mobile schedule page structure:

```
m.steamshipauthority.com/#schedule
├── Route tabs: a[href*="vineyard"], a[href*="nantucket"]
└── div.row (one per sailing)
    ├── span.departing
    │   ├── span.location_name (e.g., "Woods Hole")
    │   └── span.location_time (e.g., "8:35 AM")
    ├── span.arriving
    │   ├── span.location_name (e.g., "Vineyard Haven")
    │   └── span.location_time (e.g., "9:20 AM")
    └── span.status (cancellation text or empty)
```

### Cancellation Detection

A sailing is marked as `canceled` if ANY of these are true:
1. Status span contains "cancel" (case-insensitive)
2. Row has class containing "cancel"
3. Row contains `img[alt*="cancel"]`
4. Row's innerHTML contains "cancel"

## Popup Display

The popup shows:
- **Auto-polling status**: Active/inactive with next poll countdown
- **Last Result**: Trigger type (Auto/Manual), status, sailings count
- **Status Counts**: On-time, Canceled, Delayed breakdown

## Troubleshooting

### "OBSERVER_SECRET not configured"
- Click the extension icon and enter your secret
- Click "Save Secret"

### "No sailings found on page"
- The mobile page structure may have changed
- Check browser console for errors
- Manually visit `m.steamshipauthority.com/#schedule` to verify

### Extension not polling
- Check that the alarm is set: `chrome.alarms.get('ssa_poll')`
- Reinstall the extension to reset alarms

### Cancelled sailings not appearing
- Verify the mobile site shows cancelled sailings
- Check console logs for extraction errors
- Ensure cancellation detection patterns match

## Files

```
ssa-observer/
├── manifest.json      # Extension manifest (Manifest V3)
├── background.js      # Service worker - alarm setup, mobile scraping
├── content.js         # Content script for mobile site detection
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
- Extension only has permissions for SSA mobile and Ferry Forecast domains
- All communication over HTTPS

## Testing Checklist

1. [ ] Load extension in Chrome
2. [ ] Enter OBSERVER_SECRET and save
3. [ ] Verify "Auto-polling active" status
4. [ ] Click "Send SSA Status Now" for manual test
5. [ ] Verify success message with sailings count
6. [ ] Check corridor board for status updates
7. [ ] **Verify "Cancelled due to Trip Consolidation" sailings appear**
8. [ ] **Verify cancelled sailings persist (don't disappear)**
9. [ ] Wait 30 min and verify automatic poll runs

## Phase 42 Changes (Current)

- **IMMUTABLE CANCELLATION PERSISTENCE**: Once canceled in DB, NEVER revert, NEVER delete, NEVER clear reason
- **Two independent scrapers**:
  - **Scraper A (Canonical Schedule)**: Mobile site every 30 minutes - full sailing enumeration
  - **Scraper B (Live Status)**: Desktop site every 3 minutes - reason capture before disappearance
- **3-minute polling**: Captures cancellation reasons BEFORE sailings disappear from SSA
- **Reason enrichment**: Adds reason to existing canceled sailing without changing status
- **Transition guards**: Only allows on_time→canceled, on_time→delayed, delayed→canceled
- **STOP CONDITION**: A Trip Consolidation cancellation persists AFTER departure time with reason intact

### Phase 41 (Previous)

- **Dual-source architecture**: Scrapes both mobile schedule AND desktop status
- **Source A (mobile)**: `m.steamshipauthority.com/#schedule` - canonical sailing list
- **Source B (desktop)**: `www.steamshipauthority.com/traveling_today/status` - reason enrichment
- **Server-side merge**: API merges datasets, preserving reasons without overwriting
- **Regression guards**: Error if schedule_rows == 0, warn if reason_rows == 0
- **Queue-IT handling**: Gracefully skips Source B if Queue-IT detected
- **Backwards compatible**: Still accepts legacy `sailings[]` payload format

### Phase 40

- **URL changed**: `m.steamshipauthority.com/#schedule` (was desktop status page)
- **Full schedule push**: Sends ALL sailings every run (no deltas)
- **Cancellation retention**: Mobile schedule retains cancelled sailings
- **Route tabs**: Scrapes both Vineyard and Nantucket by clicking tabs
- **Verbatim reasons**: Preserves exact cancellation text from operator
