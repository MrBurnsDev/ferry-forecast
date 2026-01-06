# Phase 76.5 Completion Checklist

**Date:** 2026-01-05
**Status:** COMPLETE

## Summary

Phase 76.5 establishes persistent, queryable proof of data ingestion. The principle: **No more guessing. Only receipts.**

---

## Part A: Environment Variables ✅

### Ingest API (Vercel/Server)

| Variable | Required | Location | Failure Mode |
|----------|----------|----------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `.env.local` / Vercel | API won't start |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | `.env.local` / Vercel | DB queries fail |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `.env.local` / Vercel | DB writes fail (401) |
| `OBSERVER_SECRET` | Yes | `.env.local` / Vercel | Ingest returns 401 |

### Observer Extension (Chrome Storage)

| Variable | Required | Location | Failure Mode |
|----------|----------|----------|--------------|
| `observerSecret` | Yes | `chrome.storage.local` | Ingest returns 401 |

**Setup:** Enter `OBSERVER_SECRET` in the extension popup to enable auto-polling.

---

## Part B: Observer Extension `request_id` ✅

Added `request_id: crypto.randomUUID()` to all 3 payload locations in `background.js`:

1. **SSA Schedule Scraper** (line ~268) - `source: 'steamship_authority'`, `scraper: 'schedule'`
2. **SSA Live Status Scraper** (line ~465) - `source: 'steamship_authority'`, `scraper: 'live_status'`
3. **Hy-Line Schedule Scraper** (line ~1395) - `source: 'hy_line_cruises'`, `scraper: 'hyline_schedule'`

**Verification:** Each ingest call now includes a unique UUID v4 `request_id` that is:
- Generated fresh per scrape call
- Stored in `ingest_runs.request_id` (unique constraint)
- Used to track heartbeats in `observer_heartbeats.last_request_id`

---

## Part C: SQL Verification Queries ✅

Created `/scripts/verify-phase76.5.sql` with 8 verification queries:

1. **Query 1:** Check `ingest_runs` for today's date
2. **Query 2:** Check `observer_heartbeats` with health status
3. **Query 3:** Check `sailing_events` for today (grouped by status)
4. **Query 4:** Detailed `sailing_events` showing `operator_removed` sailings
5. **Query 5:** Count sailings by status
6. **Query 6:** Recent ingest runs with failure analysis
7. **Query 7:** Check `request_id` uniqueness
8. **Query 8:** Verify `sailing_origin` column exists

**Diagnosis queries** included for troubleshooting when `sailing_events_count = 0`.

---

## Part D: `operator_removed` Persistence ✅

### Schema
Migration `008_phase76_5_ingest_receipts.sql` adds:
```sql
ALTER TABLE ferry_forecast.sailing_events
ADD COLUMN sailing_origin TEXT NULL
CHECK (sailing_origin IS NULL OR sailing_origin IN ('operator_removed'));
```

### Code Path
1. **Payload type** (`route.ts:118`): `sailing_origin?: 'operator_removed'`
2. **Event input** (`sailing-events.ts:145`): `sailing_origin?: 'operator_removed'`
3. **DB insert** (`sailing-events.ts:573`): `sailing_origin: event.sailing_origin || null`
4. **DB select** (`sailing-events.ts:990`): includes `sailing_origin` in query
5. **Response** (`sailing-events.ts:1044`): `sailing_origin: row.sailing_origin || null`

### Meaning
When a sailing appears in the full schedule template but NOT in the live status page:
- Observer detects the "disappeared" sailing
- Sets `sailing_origin: 'operator_removed'`
- Sets `status: 'canceled'` (inferred from disappearance)
- Persisted to `sailing_events` table

---

## Part E: Success Criteria ✅

### Database Tables Created

| Table | Purpose | Status |
|-------|---------|--------|
| `ferry_forecast.ingest_runs` | Receipt of every ingest call | ✅ Created |
| `ferry_forecast.observer_heartbeats` | Observer health per operator | ✅ Created |

### Views Created

| View | Purpose |
|------|---------|
| `ferry_forecast.v_recent_ingests` | Recent ingest runs with age |
| `ferry_forecast.v_observer_health` | Observer health status summary |
| `ferry_forecast.v_today_sailing_events` | Today's sailings by status |

### Verification Steps

To verify Phase 76.5 is working:

1. **Run the observer extension** (enable auto-polling with secret)
2. **Check Supabase SQL Editor** with queries from `verify-phase76.5.sql`
3. **Expected results:**
   - `ingest_runs` has rows with `request_id` (not null)
   - `observer_heartbeats.last_seen_at` < 30 minutes ago
   - `sailing_events` has rows for `CURRENT_DATE`
   - `sailing_origin` column can contain `'operator_removed'`

---

## Files Modified/Created

| File | Action |
|------|--------|
| `/observer-extension/ssa-observer/background.js` | Modified - Added `request_id` to 3 payloads |
| `/scripts/verify-phase76.5.sql` | Created - Verification queries |
| `/supabase/migrations/008_phase76_5_ingest_receipts.sql` | Pre-existing - Tables and views |
| `/src/app/api/operator/status/ingest/route.ts` | Pre-existing - Handles `request_id` and receipts |
| `/src/lib/events/sailing-events.ts` | Pre-existing - Persists `sailing_origin` |
| `/.env.example` | Pre-existing - Documents required env vars |

---

## Key Principle

> **"No cancellations are appearing because NO DATA IS BEING INGESTED."**
>
> Phase 76.5 provides the receipts to prove it - or disprove it. Every ingest call is now logged. Every observer heartbeat is tracked. No more guessing.
