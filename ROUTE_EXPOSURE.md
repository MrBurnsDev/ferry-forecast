# Route Exposure Computation

**Ferry Forecast v1.1**
**Date**: December 2024

---

## Overview

Route exposure is computed using coastline geometry analysis to determine how exposed each ferry route is to wind from each of 16 compass directions. This replaces hand-authored "route sensitivity" data with physics-based values.

## Algorithm

### Concept: Fetch Distance

**Fetch** is the unobstructed distance over water that wind can blow. Longer fetch = larger waves = more exposure.

For each wind direction, we measure how far a ray can travel from the route before hitting land. Routes with long fetch distances in a given direction are more exposed to waves when wind blows from that direction.

### Computation Steps

1. **Sample Points**: For each route, sample 10 points evenly spaced along the route line.

2. **Ray Casting**: For each of 16 wind directions (N, NNE, NE, ... NNW):
   - From each sample point, cast a ray in the upwind direction
   - Step 100m at a time until hitting land or reaching max distance (50km)
   - Record the fetch distance

3. **Median Aggregation**: Take the median fetch distance across all sample points for robustness.

4. **Log-Scale Normalization**: Convert fetch_km to exposure score 0..1:
   ```
   exposure = log(fetch_km + 1) / log(max_fetch_km + 1)
   ```

### Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `sample_points` | 10 | Points along route to sample |
| `max_fetch_km` | 50 | Maximum fetch distance to check |
| `ray_step_m` | 100 | Step size for ray casting |

## Data Source

Uses **Natural Earth land polygons** (50m or 110m resolution):
- Download: https://www.naturalearthdata.com/downloads/50m-physical-vectors/
- File: `ne_50m_land.shp`

## Output Format

```json
{
  "route_id": "hy-nan-ssa",
  "exposure_by_dir": {
    "N": 0.55, "NNE": 0.52, "NE": 0.50, "ENE": 0.55,
    "E": 0.72, "ESE": 0.78, "SE": 0.82, "SSE": 0.85,
    "S": 0.88, "SSW": 0.85, "SW": 0.80, "WSW": 0.75,
    ...
  },
  "fetch_km_by_dir": {
    "N": 12.5, "S": 48.0, ...
  },
  "avg_exposure": 0.69,
  "top_exposure_dirs": ["S", "SSE", "SE"]
}
```

## Integration Points

### Scoring Engine

The exposure score is converted to a bounded modifier:
- **[-10, +15]** points on the risk score
- Low exposure (< 0.4): Up to -10 points (sheltered)
- Medium exposure (0.4-0.6): No modification
- High exposure (> 0.6): Up to +15 points (exposed)

This prevents exposure from dominating the score while ensuring correct ordering.

### UI Display

The Route Sensitivity section shows:
- **Top 3 directions** most affected by
- **Description** generated from avg_exposure level
- **Note**: "Computed from land shelter and route geometry. Does not include vessel behavior."

## Running the Computation

### Prerequisites

```bash
pip install geopandas shapely pyproj numpy
```

### Download Coastline Data

1. Download from: https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/50m/physical/ne_50m_land.zip
2. Extract to: `scripts/data/ne_50m_land/`

### Run Script

```bash
cd /path/to/ferry-forecast
python scripts/compute_route_exposure.py
```

### Output

- `src/lib/config/route_exposure.json` - Updated exposure data
- Console validation report showing exposure comparisons

## Validation Checks

The script validates that:

1. **Hyannis-Nantucket has higher exposure than Woods Hole-Vineyard Haven**
   - This is a geographic fact (longer, more open crossing)
   - If this fails, something is wrong with the computation

2. **Southerly exposure is higher for open water routes**
   - Cape Cod routes are exposed to the south (Atlantic)

## Limitations

1. **No wave physics**: This measures fetch distance, not actual wave height. Wave height depends on wind speed, duration, and other factors.

2. **No vessel behavior**: Different vessels respond differently to waves. This is route geometry only.

3. **Simplified coastline**: Uses land polygons, not detailed bathymetry or breakwaters.

4. **Static computation**: Does not account for seasonal changes or temporary obstructions.

5. **Cape Cod specific**: Parameters tuned for this region. Other regions may need adjustment.

## Files

| File | Purpose |
|------|---------|
| `scripts/compute_route_exposure.py` | Offline computation script |
| `scripts/data/ne_50m_land/` | Coastline data (not committed) |
| `src/lib/config/route_exposure.json` | Computed exposure data (committed) |
| `src/lib/config/exposure.ts` | TypeScript loader and modifier functions |
| `supabase/migrations/002_route_exposure.sql` | Optional Supabase table |

## Future Improvements

- Higher resolution coastline data for better accuracy near ports
- Account for islands and breakwaters
- Seasonal wind patterns weighting
- Correlation with historical disruption data

---

## Sign-Off

| Role | Name | Date | Verified |
|------|------|------|----------|
| Developer | | | [ ] |
| Reviewer | | | [ ] |
