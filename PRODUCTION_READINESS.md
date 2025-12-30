# Production Readiness Checklist

**Ferry Forecast v1.0**
**Date**: December 2024
**Status**: Ready for Early Public Exposure

---

## Security Audit

### API Keys & Secrets

- [x] **SUPABASE_SERVICE_ROLE_KEY never exposed to client**
  - Only used in server-side code (`src/app/api/outcomes/log/route.ts`, `src/lib/supabase/client.ts`)
  - Not prefixed with `NEXT_PUBLIC_`
  - Browser cannot access this key

- [x] **NEXT_PUBLIC_ keys are safe for exposure**
  - `NEXT_PUBLIC_SUPABASE_URL` - Safe, public endpoint
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Safe, limited by RLS policies

- [x] **No hardcoded secrets in codebase**
  - All sensitive values come from environment variables
  - `.env` files are in `.gitignore`

### Row Level Security (RLS)

- [x] **Outcome logs are append-only**
  - RLS enabled on `ferry_forecast.outcome_logs`
  - Public SELECT policy allows reads
  - NO INSERT/UPDATE/DELETE policies for anon/authenticated
  - Client-side writes are blocked at database level

- [x] **Route/port/operator tables are read-only for clients**
  - Only service role can modify reference data

---

## Error Handling

### API Failure Modes

- [x] **Weather API failure degrades gracefully**
  - Returns 503 with generic message: "Unable to fetch weather data from NOAA"
  - Includes `Retry-After: 60` header
  - Does not expose internal stack traces

- [x] **Advisory fetch failure is non-blocking**
  - Falls back to `none` advisory level
  - Warning logged but not exposed to user

- [x] **Tide data failure is non-blocking**
  - Scoring continues without tide data
  - Warning included in metadata, not error

- [x] **Operator status failure is non-blocking**
  - Shows "Live status unavailable" with contextual messaging
  - Does not break the forecast page

### Client-Side Error States

- [x] **Loading states shown for all async data**
  - Skeleton loaders for timeline, risk bar, conditions panel

- [x] **Error states are user-friendly**
  - No stack traces or technical error codes shown
  - Clear messaging: "Unable to load forecast", "Data unavailable"

---

## Disclaimers & Legal

### Visible Disclaimers

- [x] **Homepage disclaimer present**
  - Location: Below route selector
  - Content: "This is a prediction tool, not an official source. Always check with your ferry operator..."

- [x] **Route page disclaimer present**
  - Location: Below main content
  - Content: "This forecast shows the predicted risk of disruption... not a guarantee..."

- [x] **Footer attribution present**
  - "Not affiliated with any ferry operator"
  - Data sources listed: NOAA Marine Forecast, NWS Advisories, NOAA CO-OPS Tides

### Accuracy Claims

- [x] **No false accuracy claims**
  - Does not claim specific accuracy percentages
  - Does not claim ML/AI learning (yet)
  - Clear that predictions are weather-based

- [x] **Confidence uncertainty explained**
  - "Predictions are more reliable for the next few hours"
  - "Become less certain further out as weather patterns can change"

---

## Learning Boundary

### Documentation

- [x] **Outcome logging purpose documented**
  - SQL migration includes detailed comments
  - API route includes learning boundary block

- [x] **Scoring engine clearly marked as weather-only**
  - Header block states: "NO learning, ML, or adaptive behavior is active"
  - Historical matches parameter exists but receives no data

- [x] **Learning hooks marked as inactive**
  - Comments state: "These functions exist for FUTURE use"
  - "NOT currently integrated into the prediction pipeline"

### User-Facing Clarity

- [x] **No "AI" or "ML" claims in UI**
  - All copy refers to "weather-based predictions"
  - No implication of learned patterns

- [x] **Timeline labeled as "Weather Risk Timeline"**
  - Not "Forecast" (which implies more certainty)
  - Subtitle: "Next 24 hours"

---

## Accessibility

- [x] **Skip-to-content link for keyboard users**
- [x] **ARIA labels on interactive elements**
- [x] **Role attributes on status regions**
- [x] **Focus states visible**
- [x] **Color not sole indicator** (text labels accompany colors)

---

## Data Sources

| Source | Purpose | Failure Mode |
|--------|---------|--------------|
| NOAA Weather API | Hourly forecasts | 503 error, page shows warning |
| NWS Alerts API | Marine advisories | Falls back to "none" |
| NOAA CO-OPS | Tide data | Scoring continues without tides |
| Operator scraping | Live status | Shows "Live status unavailable" |

---

## Known Limitations

1. **Weather-only predictions** - Does not account for vessel-specific thresholds
2. **No historical learning** - Outcome data collected but not used
3. **Cape Cod region only** - Other regions not yet supported
4. **Operator status scraping** - May lag behind real-time changes
5. **Hourly granularity** - Cannot predict specific sailing times

---

## Pre-Launch Verification

Before public announcement:

- [ ] Verify Supabase RLS policies are applied in production
- [ ] Verify SUPABASE_SERVICE_ROLE_KEY is set in Vercel (not exposed)
- [ ] Verify NOAA/NWS API endpoints are accessible from Vercel
- [ ] Test outcome log API rejects client-side writes
- [ ] Review analytics/monitoring setup

---

## Sign-Off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Developer | | | [ ] |
| Reviewer | | | [ ] |

