# Sailing vs Route: UX Distinction

**Ferry Forecast v1.4**
**Date**: December 2024

---

## Overview

This document explains the critical distinction between **sailings** and **routes** in Ferry Forecast, and how the UI communicates this to users.

---

## The Problem

Previous versions of Ferry Forecast showed a **route-level risk score** (0-100) prominently. Users interpreted this as:

> "Risk score 72 = ferries are probably canceled"

This is **incorrect**. In reality:

- Ferry operators cancel **individual sailings**, not entire routes
- A route (e.g., Woods Hole ↔ Vineyard Haven) may have:
  - Some sailings running normally
  - Some sailings delayed
  - Some sailings canceled
- High weather risk does **not** mean all sailings are canceled
- Low weather risk does **not** mean all sailings will run

---

## The Solution: Two-Pane Layout

The route page is now split into two clear sections:

### Pane A: Today's Sailings (Primary)

**Purpose**: Show what is actually scheduled and what the operator reports.

**Contents**:
- List of today's sailings with departure times
- Direction (e.g., "Vineyard Haven → Woods Hole")
- Operator name
- Per-sailing status when available:
  - "Scheduled" (default, no operator input)
  - "Running" (operator confirmed)
  - "Delayed" (operator reported)
  - "Canceled" (operator reported)

**Visual Rules**:
- Calm, timetable-like presentation
- No red coloring unless the operator explicitly says "Canceled"
- Departed sailings are visually de-emphasized

**What This Pane Does NOT Show**:
- Risk scores
- Weather predictions
- Inferred cancellations

### Pane B: Weather Risk Context (Secondary)

**Purpose**: Provide weather context for planning, not prediction.

**Contents**:
- Route-level weather risk score (0-100)
- Weather Risk Timeline (24 hours)
- Current conditions (wind, tide, advisories)
- Route sensitivity (exposure to wind directions)

**Framing**:
- Labeled "Weather Risk Context" with "Route-level" badge
- Explicit disclaimer: "Individual sailings may run or be canceled independently"
- De-emphasized compared to the Sailings pane

---

## Key UI Copy

### Trust Statement (Top of Page)
> "This app does not predict individual ferry cancellations. It provides weather-based risk context to help travelers plan. Always verify with the operator."

### Weather Context Card
> "This is a weather-based risk assessment for the route overall. Individual sailings may run or be canceled independently."

### Weather Timeline
> "This shows how weather conditions affecting ferry reliability may change over time. It is not a sailing schedule."

### Disclaimer (Bottom of Page)
> "The weather risk score shows conditions that may affect ferry reliability. It does **not** predict which specific sailings will be canceled. Ferries may run during elevated risk, or be canceled during low risk."

---

## Schedule Provenance Rules (Phase 15)

### Core Principle
**We NEVER silently substitute made-up schedules.** Every schedule response must declare its source.

### Source Types

| source_type | Meaning | UI Display |
|-------------|---------|------------|
| `operator_live` | Parsed from operator website/API | Green "Live" badge with timestamp |
| `template` | User-configured template (NOT live) | Yellow "Template (not live)" warning |
| `unavailable` | Could not fetch, no data | "Schedule unavailable" with link to operator |

### Provenance Metadata

Every schedule response includes:

```typescript
interface ScheduleProvenance {
  source_type: 'operator_live' | 'template' | 'unavailable';
  source_name: string;        // e.g., "Steamship Authority"
  fetched_at: string;         // ISO timestamp
  source_url: string;         // Link to operator schedule
  parse_confidence: 'high' | 'medium' | 'low';
  raw_status_supported: boolean;
  error_message?: string;     // If unavailable
}
```

### UI Behavior by Source Type

#### When `source_type: "operator_live"`
- Show sailings with green "Live" badge
- Display: "Source: Steamship Authority - fetched at 6:12 AM"
- Full sailing list with times and directions

#### When `source_type: "template"`
- Show sailings with yellow warning banner
- Display: "Template schedule - not live"
- Warning: "These times are approximate and may not reflect today's actual schedule"
- Still show sailings but with clear caveat

#### When `source_type: "unavailable"`
- Do NOT show any sailing times
- Display: "Live schedule unavailable"
- Show error message if available
- Prominent button: "Open operator schedule" (links to operator website)
- Note: "We only show schedules we can verify from the operator. No made-up times."

### Why This Matters

Users who see a schedule and then find it's wrong will lose trust. By being honest about:
- What we **verified** (operator_live)
- What we **approximated** (template)
- What we **don't know** (unavailable)

We maintain credibility and set appropriate expectations.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                       ROUTE PAGE                            │
├─────────────────────────────┬───────────────────────────────┤
│                             │                               │
│  TODAY'S SAILINGS           │  WEATHER RISK CONTEXT         │
│  (What's Scheduled)         │  (Conditions for Planning)    │
│                             │                               │
│  Source:                    │  Source:                      │
│  - /api/schedule/:routeId   │  - /api/forecast/route/:id    │
│  - Operator websites        │  - NOAA Weather API           │
│  - Provenance metadata      │  - NWS Alerts API             │
│                             │  - NOAA CO-OPS Tides          │
│                             │                               │
│  Shows:                     │  Shows:                       │
│  - Source type badge        │  - Risk score (0-100)         │
│  - Fetch timestamp          │  - 24h weather timeline       │
│  - Departure times          │  - Wind, tide, advisories     │
│  - Direction                │  - Route exposure             │
│  - Operator status          │                               │
│                             │                               │
│  Does NOT:                  │  Does NOT predict:            │
│  - Show made-up times       │  - Per-sailing outcomes       │
│  - Predict cancellations    │                               │
│                             │                               │
└─────────────────────────────┴───────────────────────────────┘
```

---

## API Response Shape

### /api/schedule/:routeId

```json
{
  "routeId": "wh-vh-ssa",
  "scheduleDate": "2024-12-30",
  "operator": "Steamship Authority",
  "operatorScheduleUrl": "https://www.steamshipauthority.com/schedules",
  "sailings": [...],
  "provenance": {
    "source_type": "unavailable",
    "source_name": "Steamship Authority",
    "fetched_at": "2024-12-30T11:12:34.567Z",
    "source_url": "https://www.steamshipauthority.com/schedules",
    "parse_confidence": "low",
    "raw_status_supported": false,
    "error_message": "Could not parse schedule from SSA website."
  },
  "operatorStatus": {
    "status": null,
    "source": null,
    "message": null
  }
}
```

---

## Rate Limiting & Caching

To protect operator websites:

- **Cache TTL**: 5 minutes
- **Rate limit**: 10 seconds between requests to same operator
- **Request coalescing**: Concurrent requests share one fetch
- **Graceful degradation**: If blocked, return "unavailable" (never fake data)

---

## Debug Mode

For development/troubleshooting:

```bash
SCHEDULE_DEBUG=true npm run dev
```

Logs (server-side only):
- Parse counts
- HTML size
- Parse duration
- Failure reasons

**Never logs**: User data, secrets, PII

---

## Why This Matters

### User Trust
Users who see a high risk score but then observe ferries running will lose trust in the app. By clearly separating:
- What we **know** (sailings, operator status)
- What we **estimate** (weather risk)

We set appropriate expectations.

### Schedule Trust
Users who see schedule times and then find them wrong will lose trust. By clearly showing:
- **Live**: We verified this from the operator
- **Template**: This is approximate, check with operator
- **Unavailable**: We don't know, here's the operator link

We maintain credibility.

### Operator Alignment
Ferry operators communicate per-sailing, not per-route. Our UI now mirrors this reality.

### Future-Proofing
When we eventually add per-sailing predictions, we'll have a clean conceptual foundation to build on.

---

## Summary

| Concept | Definition | What We Show | What We DON'T Do |
|---------|------------|--------------|------------------|
| **Sailing** | A specific departure (7:00 AM VH→WH) | Time, direction, operator status | Predict cancellation |
| **Route** | A port-to-port connection | Weather risk, conditions, exposure | Guarantee outcomes |
| **Schedule** | Today's sailing times | Only verified or clearly labeled data | Invent times silently |

The key insights:
- **Elevated weather risk ≠ All sailings canceled**
- **No data is better than false data**

---

## Sign-Off

| Role | Name | Date | Verified |
|------|------|------|----------|
| Developer | | | [ ] |
| Reviewer | | | [ ] |
