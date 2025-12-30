# Sailing vs Route: UX Distinction

**Ferry Forecast v1.3**
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
│  - Static fallback          │  - NWS Alerts API             │
│                             │  - NOAA CO-OPS Tides          │
│                             │                               │
│  Shows:                     │  Shows:                       │
│  - Departure times          │  - Risk score (0-100)         │
│  - Direction                │  - 24h weather timeline       │
│  - Operator status          │  - Wind, tide, advisories     │
│                             │  - Route exposure             │
│                             │                               │
│  Does NOT predict:          │  Does NOT predict:            │
│  - Future cancellations     │  - Per-sailing outcomes       │
│                             │                               │
└─────────────────────────────┴───────────────────────────────┘
```

---

## Why This Matters

### User Trust
Users who see a high risk score but then observe ferries running will lose trust in the app. By clearly separating:
- What we **know** (sailings, operator status)
- What we **estimate** (weather risk)

We set appropriate expectations.

### Operator Alignment
Ferry operators communicate per-sailing, not per-route. Our UI now mirrors this reality.

### Future-Proofing
When we eventually add per-sailing predictions (Phase 15+), we'll have a clean conceptual foundation to build on.

---

## Schedule Data

### Current Implementation
- Static schedule templates with approximate departure times
- Best-effort parsing of operator websites (designed to fail gracefully)
- Operator-level status applied to sailings when available

### Limitations
- Schedules vary by season (templates are approximate)
- Live per-sailing status requires operator API or more robust scraping
- We do NOT predict per-sailing cancellations

### Future Improvements
- Parse operator mobile/API endpoints for real-time schedules
- Add per-sailing status parsing
- Correlation between weather and per-sailing outcomes (ML-based)

---

## Summary

| Concept | Definition | What We Show | What We DON'T Do |
|---------|------------|--------------|------------------|
| **Sailing** | A specific departure (7:00 AM VH→WH) | Time, direction, operator status | Predict cancellation |
| **Route** | A port-to-port connection | Weather risk, conditions, exposure | Guarantee outcomes |

The key insight: **Elevated weather risk ≠ All sailings canceled**

---

## Sign-Off

| Role | Name | Date | Verified |
|------|------|------|----------|
| Developer | | | [ ] |
| Reviewer | | | [ ] |
