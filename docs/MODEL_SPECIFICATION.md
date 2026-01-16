# Ferry Forecast Prediction Model Specification

**Version:** heuristic_v1.0
**Last Updated:** January 2026
**Status:** Production

## Executive Summary

The Ferry Forecast prediction model estimates the likelihood that a ferry sailing will operate as scheduled based on weather conditions. The model is **deterministic** and **transparent** - the same inputs always produce the same outputs, and all scoring logic is documented here.

This document provides complete mathematical transparency for regulatory, business, or technical review.

---

## Data Sources

### Primary Input: Weather Forecast Data

| Source | Provider | Update Frequency | Data Type |
|--------|----------|------------------|-----------|
| Wind Speed | Open-Meteo (GFS model) | Hourly | mph at 10m elevation |
| Wind Gusts | Open-Meteo (GFS model) | Hourly | mph at 10m elevation |
| Wind Direction | Open-Meteo (GFS model) | Hourly | Degrees (0-360) |
| Marine Advisories | NOAA via Open-Meteo | As issued | Categorical |

### Data Flow

```
Open-Meteo API → Weather Fetch → Risk Calculation → User Display
     ↓
  GFS Model
  (NOAA)
```

**Note:** The prediction model does NOT currently incorporate historical sailing outcome data. All predictions are derived from weather forecasts.

---

## Risk Score Calculation

### Formula

The risk score is calculated as:

```
RiskScore = min(100, WindScore + GustScore + AdvisoryScore)
```

Where each component is computed as follows:

---

### Wind Speed Scoring

| Condition | Wind Speed (mph) | Points Added | Explanation |
|-----------|------------------|--------------|-------------|
| Calm | < 15 | 0 | Normal operating conditions |
| Light | 15 - 19 | +5 | Minor factor, noted for awareness |
| Moderate | 20 - 24 | +15 | Noticeable conditions, some routes sensitive |
| Strong | 25 - 29 | +25 | Significant operational impact likely |
| Very Strong | 30 - 39 | +35 | High probability of delays/cancellations |
| Severe | ≥ 40 | +50 | Likely cancellation for most vessels |

**Mathematical Expression:**

```
WindScore =
    0     if wind_speed < 15
    5     if 15 ≤ wind_speed < 20
    15    if 20 ≤ wind_speed < 25
    25    if 25 ≤ wind_speed < 30
    35    if 30 ≤ wind_speed < 40
    50    if wind_speed ≥ 40
```

---

### Wind Gust Scoring

Gusts are scored separately because sudden wind increases affect vessel stability differently than sustained winds.

| Condition | Gust Speed (mph) | Points Added |
|-----------|------------------|--------------|
| Normal | < 25 | 0 |
| Moderate | 25 - 34 | +6 |
| Elevated | 35 - 44 | +12 |
| High | 45 - 54 | +20 |
| Severe | ≥ 55 | +30 |

**Mathematical Expression:**

```
GustScore =
    0     if gusts < 25
    6     if 25 ≤ gusts < 35
    12    if 35 ≤ gusts < 45
    20    if 45 ≤ gusts < 55
    30    if gusts ≥ 55
```

---

### Marine Advisory Scoring

Marine advisories issued by NOAA carry significant weight as they represent official weather service assessments.

| Advisory Level | Points Added | Description |
|----------------|--------------|-------------|
| None | 0 | No active advisories |
| Small Craft Advisory | +15 | Winds 20-33 kt expected |
| Gale Warning | +30 | Winds 34-47 kt expected |
| Storm Warning | +45 | Winds 48-63 kt expected |
| Hurricane Warning | +60 | Hurricane conditions expected |

**Mathematical Expression:**

```
AdvisoryScore =
    0     if advisory = none
    15    if advisory = small_craft_advisory
    30    if advisory = gale_warning
    45    if advisory = storm_warning
    60    if advisory = hurricane_warning
```

---

### Combined Example

**Scenario:** A sailing with 27 mph sustained winds, 42 mph gusts, and a Small Craft Advisory in effect.

```
WindScore     = 25    (25 ≤ 27 < 30 → Strong winds)
GustScore     = 12    (35 ≤ 42 < 45 → Elevated gusts)
AdvisoryScore = 15    (Small Craft Advisory)
────────────────────
RiskScore     = 52    (capped at 100)
```

**Result:** Risk Score of 52 → "Elevated Risk"

---

## Risk Level Classification

The numeric risk score is mapped to a categorical risk level:

| Risk Level | Score Range | User Guidance |
|------------|-------------|---------------|
| Low | 0 - 24 | Conditions favorable, disruptions unlikely |
| Moderate | 25 - 44 | Some factors present, monitor conditions |
| Elevated | 45 - 64 | Notable factors, delays possible |
| High | 65 - 84 | Significant factors, disruptions likely |
| Severe | 85 - 100 | Likely cancellation |

**Mathematical Expression:**

```
RiskLevel =
    "low"      if score < 25
    "moderate" if 25 ≤ score < 45
    "elevated" if 45 ≤ score < 65
    "high"     if 65 ≤ score < 85
    "severe"   if score ≥ 85
```

---

## Confidence Rating

Forecast confidence decreases with prediction horizon:

| Hours Until Sailing | Confidence Level | Confidence Value |
|---------------------|------------------|------------------|
| 0 - 24 hours | High | 0.85 |
| 25 - 72 hours | Medium | 0.70 |
| 73 - 168 hours | Medium | 0.55 |
| > 168 hours | Low | 0.40 |

**Rationale:** Weather forecasts become less accurate over time. GFS model skill scores drop significantly after 5-7 days.

---

## Model Transparency Guarantees

### Determinism

The model is fully deterministic:
- **Same weather inputs → Same risk score** (always)
- No randomness, no stochastic elements
- No hidden state or memory between predictions

### No Machine Learning

The current model (v1.0) does NOT use:
- Neural networks
- Gradient descent
- Training data
- Historical outcome feedback
- Any adaptive or learning components

All weights and thresholds are fixed constants defined in source code.

### Source Code References

| Component | File Path | Line Numbers |
|-----------|-----------|--------------|
| Wind thresholds | `src/lib/forecast/heuristic-baseline.ts` | 87-103 |
| Risk calculation | `src/lib/forecast/heuristic-baseline.ts` | 136-201 |
| Risk level mapping | `src/lib/forecast/heuristic-baseline.ts` | 206-212 |
| Confidence calculation | `src/lib/forecast/heuristic-baseline.ts` | 218-228 |
| Scoring weights | `src/lib/scoring/weights.ts` | 7-23 |

---

## Data Freshness

### Weather Data Updates

- **Source:** Open-Meteo API (backed by NOAA GFS model)
- **Fetch frequency:** On each user request (real-time)
- **GFS model runs:** Every 6 hours (00Z, 06Z, 12Z, 18Z)
- **Data latency:** ~2-4 hours from model run to availability

### Prediction Generation

Predictions are generated **on-demand** when a user views a corridor or forecast. There is no caching of predictions; each request fetches fresh weather data.

---

## Validation & Accuracy

### Current State

The model is in its initial deployment phase. Accuracy metrics are being collected but not yet sufficient for statistical validation.

### Data Collection Infrastructure

| Table | Purpose | Status |
|-------|---------|--------|
| `sailing_events` | Observed sailing outcomes | Active collection |
| `outcome_logs` | User-reported outcomes | Manual submission |
| `prediction_snapshots_v2` | Historical predictions | Active storage |
| `prediction_outcomes` | Prediction-outcome links | Infrastructure ready |

### Future Validation

Once sufficient outcome data is collected (target: 1,000+ linked predictions), accuracy metrics will include:
- Overall accuracy rate
- Accuracy by risk level
- Mean absolute score error
- Confusion matrix by outcome type

---

## Limitations & Disclaimers

### What This Model Does

1. Estimates disruption risk based on weather forecasts
2. Provides transparent, reproducible scoring
3. Updates predictions with fresh weather data

### What This Model Does NOT Do

1. **Guarantee outcomes** - Weather forecasts have inherent uncertainty
2. **Learn from history** - Current version uses fixed weights
3. **Account for non-weather factors** - Mechanical issues, crew availability, etc. are not modeled
4. **Replace operator information** - Users should always verify with ferry operators

### Accuracy Expectations

Based on the model design:
- **Short-term (< 24 hours):** Higher accuracy, weather forecasts reliable
- **Medium-term (1-3 days):** Moderate accuracy, conditions may change
- **Long-term (> 3 days):** Lower accuracy, significant forecast uncertainty

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| heuristic_v1.0 | Jan 2026 | Initial production release |

---

## Contact & Source

- **Repository:** Private (available upon request for audit)
- **Model code:** `src/lib/forecast/heuristic-baseline.ts`
- **Weights:** `src/lib/scoring/weights.ts`

For technical inquiries about the model, contact the development team.
