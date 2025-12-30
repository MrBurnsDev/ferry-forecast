# Route Exposure V2 - Shelter Signature Algorithm

**Ferry Forecast v1.2**
**Date**: December 2024

---

## Overview

Route Exposure V2 replaces the V1 fetch-distance approach with a **shelter signature algorithm** that correctly handles coastal and island regions. The key insight is that fetch distance alone is numerically unstable near complex coastlines—what matters is whether points along the route are **locally sheltered** from each wind direction.

### Why V2?

V1's fetch-based approach produced incorrect results:
- Woods Hole → Vineyard Haven (~10km sound crossing) had exposure scores too close to
- Hyannis → Nantucket (~44km open water crossing)

This violated the fundamental geographic reality that open ocean crossings are more exposed than protected sound crossings.

V2 fixes this by asking a different question: "What fraction of the route is sheltered from each wind direction?" instead of "How far can wind travel before hitting land?"

---

## Algorithm

### V1 (Deprecated) - Fetch Distance

```
exposure = log(fetch_km + 1) / log(max_fetch_km + 1)
```

**Problem**: Fetch distance is unstable in coastal regions. A route through a sound might have long fetch in some directions despite being mostly sheltered.

### V2 (Current) - Shelter Signature

For each route and each of 16 wind directions:

1. **Sample 50 points** evenly along the route line
2. **Cast 30km rays** upwind from each point
3. **Classify each point** as "sheltered" if land is hit within 3km
4. **shelter_ratio** = (points NOT sheltered) / total points
   - 1.0 = fully open (no points hit land within 3km)
   - 0.0 = fully sheltered (all points hit land within 3km)

```
shelter_ratio[direction] = 1 - mean(sheltered_flags)
```

### Parameters

| Parameter | V1 | V2 | Rationale |
|-----------|----|----|-----------|
| Sample points | 10 | **50** | Higher resolution for accuracy |
| Max ray distance | 50km | **30km** | Reduced to focus on relevant distances |
| Land resolution | 50m | **10m** | Better coastal accuracy |
| Shelter threshold | N/A | **3km** | Point is sheltered if land within 3km |
| Ray step | 100m | **50m** | Finer granularity |

---

## Scoring Integration

### V1 Modifier (Deprecated)

```typescript
// Piecewise function with [-10, +15] bounds
if (exposure < 0.4) {
  modifier = -10 * (1 - exposure / 0.4);  // Sheltered: up to -10
} else if (exposure > 0.6) {
  modifier = 15 * (exposure - 0.6) / 0.4;  // Exposed: up to +15
} else {
  modifier = 0;  // Neutral zone
}
```

### V2 Modifier (Current)

```typescript
// Simple linear interpolation with [-8, +12] bounds
modifier = lerp(-8, +12, shelter_ratio)
       = -8 + 20 * shelter_ratio

// Examples:
// shelter_ratio 0.0 (fully sheltered) → -8 points
// shelter_ratio 0.5 (mixed)           → +2 points
// shelter_ratio 1.0 (fully open)      → +12 points
```

The V2 formula is:
- **Simpler**: Linear instead of piecewise
- **Tighter bounds**: [-8, +12] vs [-10, +15] to prevent dominating the score
- **Always applies**: No neutral zone—every route gets a modifier based on actual geometry

---

## Validation

The V2 script includes validation assertions:

### Route Distance Check
```
Hyannis → Nantucket: ~44km (open water)
Woods Hole → Vineyard Haven: ~10km (sound crossing)
```

### Exposure Ordering Check
```
REQUIREMENT: mean_shelter_ratio(HY-NAN) > mean_shelter_ratio(WH-VH) by >= 0.2
```

If this fails, the computation has an error. The Nantucket Sound crossing is ~4x longer over open water and must show significantly higher exposure.

---

## Data Files

| File | Purpose |
|------|---------|
| `scripts/compute_route_exposure_v2.py` | Offline computation script |
| `scripts/data/ne_10m_land/` | Natural Earth 10m land data (not committed) |
| `src/lib/config/route_exposure.json` | Computed exposure data (auto-detects v1/v2) |
| `src/lib/config/exposure.ts` | TypeScript loader with v1/v2 compatibility |

---

## Running the Computation

### Prerequisites

```bash
pip install geopandas shapely pyproj numpy
```

### Download Coastline Data

```bash
# Download Natural Earth 10m land (recommended for V2)
curl -L "https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/physical/ne_10m_land.zip" -o ne_10m_land.zip
unzip ne_10m_land.zip -d scripts/data/ne_10m_land/
```

### Run Script

```bash
cd /path/to/ferry-forecast
python scripts/compute_route_exposure_v2.py
```

### Expected Output

```
Route Exposure V2 - Shelter Signature Algorithm
============================================================

VALIDATION: Route Distances (Haversine)
============================================================
  woods-hole → vineyard-haven: 10.2 km (expected ~10 km) [PASS]
  hyannis → nantucket: 44.1 km (expected ~44 km) [PASS]
  ...

Computing shelter signatures for 10 routes...
  wh-vh-ssa... mean_ratio=0.320
  hy-nan-ssa... mean_ratio=0.780
  ...

VALIDATION: Exposure Ordering
============================================================
  Mean Shelter Ratios (higher = more exposed):
    Hyannis → Nantucket:       0.780
    Woods Hole → Vineyard Haven: 0.320
    Difference:                 +0.460

  Check: HY-NAN > WH-VH by >= 0.2: PASS

✓ Output written to: src/lib/config/route_exposure.json
✓ All validations passed!
```

---

## UI Display

The Route Sensitivity section shows:

- **Exposure description**: Generated from shelter_ratio with percentage
  - "This longer crossing through Nantucket Sound has high open-water exposure to S, SSE, and SE winds (78% open)."
- **Top 3 wind directions** most affected by
- **Note**: "Computed using shelter-signature algorithm (v2). Does not include vessel behavior."

---

## Prediction Logging

V2 includes infrastructure for future accuracy analysis:

### prediction_snapshots Table

Stores each prediction made:
- Route ID and forecast time
- Predicted score, risk level, confidence
- Weather and tide inputs
- **Exposure version used** (1 or 2)
- **Exposure modifier applied**
- **Wind direction bucket**
- Model version

### Integration

Predictions are logged when `ENABLE_PREDICTION_LOGGING=true`:

```typescript
// In forecast API (fire-and-forget)
logPredictionSnapshot(routeId, weather, tide, riskScore, riskLevel, modelVersion);
```

### Future Analysis

Join prediction_snapshots with outcome_logs to:
- Compare predicted scores with actual outcomes
- Measure accuracy by exposure version
- Identify routes or conditions where predictions are inaccurate
- Tune weights based on real-world data

---

## Limitations

1. **Shelter threshold is fixed**: 3km may not be optimal for all conditions
2. **No wave physics**: Shelter reduces exposure but doesn't model actual wave height
3. **Static coastline**: Uses land polygons, not dynamic breakwaters or seasonal changes
4. **No vessel behavior**: Different vessels respond differently to waves
5. **Cape Cod specific**: Parameters tuned for this region

---

## Future Improvements

- Validate against historical disruption data
- Per-season shelter thresholds (storm surge, ice)
- Account for harbor breakwaters
- Correlation with vessel-specific disruption rates

---

## Sign-Off

| Role | Name | Date | Verified |
|------|------|------|----------|
| Developer | | | [ ] |
| Reviewer | | | [ ] |
