# Social Prediction Game - System Design Document

**Feature Branch:** `feature/social-predictions`
**Feature Flag:** `NEXT_PUBLIC_SOCIAL_PREDICTIONS_ENABLED`
**Status:** Design Phase
**Last Updated:** 2026-01-09

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Feature Flag Implementation](#2-feature-flag-implementation)
3. [Authentication & User Profiles](#3-authentication--user-profiles)
4. [Prediction System](#4-prediction-system)
5. [Scoring Logic](#5-scoring-logic)
6. [Daily Crown System](#6-daily-crown-system)
7. [Leaderboards](#7-leaderboards)
8. [Notifications & Sharing](#8-notifications--sharing)
9. [Database Schema](#9-database-schema)
10. [User Flows](#10-user-flows)
11. [UI/UX Components](#11-uiux-components)
12. [Edge Cases & Safeguards](#12-edge-cases--safeguards)
13. [Implementation Checklist](#13-implementation-checklist)

---

## 1. System Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Next.js App)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Trip Cards  │  │ Leaderboard │  │ User Profile│  │ Crown Modal │    │
│  │ + Thumbs UI │  │   Page      │  │   Panel     │  │ + Share CTA │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                   │                                      │
│                    ┌──────────────▼──────────────┐                      │
│                    │   Feature Flag Gate         │                      │
│                    │   NEXT_PUBLIC_SOCIAL_       │                      │
│                    │   PREDICTIONS_ENABLED       │                      │
│                    └──────────────┬──────────────┘                      │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                           API LAYER (Next.js)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  /api/social/                                                           │
│  ├── auth/callback          (OAuth callback handler)                    │
│  ├── predictions            (POST: create, GET: list user predictions)  │
│  ├── predictions/score      (POST: score resolved predictions - cron)   │
│  ├── leaderboard            (GET: daily/all-time rankings)              │
│  ├── profile                (GET/PATCH: user profile)                   │
│  ├── crown                  (GET: current crown holder)                 │
│  └── crown/assign           (POST: assign daily crown - cron)           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                        SUPABASE (PostgreSQL)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Tables (ferry_forecast schema):                                        │
│  ├── social_users           (user profiles, OAuth data)                 │
│  ├── social_predictions     (user predictions per sailing)              │
│  ├── social_point_events    (scoring audit trail)                       │
│  ├── social_daily_points    (daily aggregations)                        │
│  └── social_crown_winners   (crown history)                             │
│                                                                         │
│  Existing Tables (read-only access):                                    │
│  ├── sailing_events         (actual outcomes)                           │
│  └── prediction_snapshots_v2 (likelihood data at prediction time)       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Integration with Existing Systems

The social prediction system is an **overlay** on the existing ferry prediction infrastructure:

| Existing System | Integration Point |
|-----------------|-------------------|
| `TerminalBoardSailing` | Source of `sailing_id`, `likelihood_to_run_pct`, `likelihood_confidence` |
| `sailing_events` | Source of truth for actual outcomes (sailed/canceled) |
| `prediction_snapshots_v2` | Captures likelihood at prediction time for fair scoring |
| Supabase Auth | New: OAuth providers (Google, Facebook, X) |
| `/api/corridor/[id]` | Extended: Include user's prediction state if authenticated |

### Data Flow

```
User opens sailing card
        │
        ▼
┌───────────────────┐
│ Check feature flag │
└─────────┬─────────┘
          │ enabled
          ▼
┌───────────────────┐      ┌───────────────────┐
│ Check auth state  │──no──▶│ Show "Connect to  │
└─────────┬─────────┘      │ Play" CTA         │
          │ yes            └───────────────────┘
          ▼
┌───────────────────┐
│ Fetch user's      │
│ prediction for    │
│ this sailing      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐      ┌───────────────────┐
│ Has prediction?   │──yes─▶│ Show locked state │
└─────────┬─────────┘      │ with user's pick  │
          │ no             └───────────────────┘
          ▼
┌───────────────────┐      ┌───────────────────┐
│ Within lock       │──yes─▶│ Show "Predictions │
│ window?           │      │ Closed" state     │
└─────────┬─────────┘      └───────────────────┘
          │ no
          ▼
┌───────────────────┐
│ Show prediction   │
│ buttons (👍 / 👎) │
└───────────────────┘
```

---

## 2. Feature Flag Implementation

### Environment Variable

```bash
# .env.local (development)
NEXT_PUBLIC_SOCIAL_PREDICTIONS_ENABLED=true

# .env.production (production - initially disabled)
NEXT_PUBLIC_SOCIAL_PREDICTIONS_ENABLED=false

# Vercel Preview deployments
NEXT_PUBLIC_SOCIAL_PREDICTIONS_ENABLED=true
```

### Client-Side Gate

```typescript
// src/lib/social/feature-flag.ts

export function isSocialPredictionsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SOCIAL_PREDICTIONS_ENABLED === 'true';
}

// React hook for components
export function useSocialPredictions() {
  const enabled = isSocialPredictionsEnabled();
  return { enabled };
}
```

### API Route Gate

```typescript
// src/lib/social/api-guard.ts

import { NextResponse } from 'next/server';

export function guardSocialRoute() {
  if (process.env.NEXT_PUBLIC_SOCIAL_PREDICTIONS_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Social predictions feature is not enabled' },
      { status: 404 }
    );
  }
  return null; // Continue with route handler
}

// Usage in route handlers:
export async function GET(request: Request) {
  const guard = guardSocialRoute();
  if (guard) return guard;

  // ... rest of handler
}
```

### Component Gate

```typescript
// src/components/social/SocialGate.tsx

interface SocialGateProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function SocialGate({ children, fallback = null }: SocialGateProps) {
  const { enabled } = useSocialPredictions();

  if (!enabled) {
    return fallback;
  }

  return children;
}
```

### Safe Merge Guarantee

When `NEXT_PUBLIC_SOCIAL_PREDICTIONS_ENABLED=false`:

- [ ] All `/api/social/*` routes return 404
- [ ] No social UI components render
- [ ] No cron jobs execute social logic
- [ ] No database queries to social tables
- [ ] Zero performance impact on existing features
- [ ] Safe to merge to `main` branch

---

## 3. Authentication & User Profiles

### OAuth Provider Configuration

**Supabase Auth Providers:**

| Provider | Status | Notes |
|----------|--------|-------|
| Google | Required | Most common, reliable |
| Facebook | Required | Wide reach, share integration |
| X (Twitter) | Optional | Check Supabase support status |

### Authentication Flow

```
User clicks "Connect to Play"
        │
        ▼
┌───────────────────────┐
│ Show provider picker  │
│ (Google / Facebook)   │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│ Supabase Auth redirect│
│ to OAuth provider     │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│ User grants           │
│ permission            │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│ Callback to           │
│ /api/social/auth/     │
│ callback              │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│ Create/update         │
│ social_users record   │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│ Redirect to original  │
│ page with session     │
└───────────────────────┘
```

### User Profile Data

**Stored from OAuth:**
- `auth_user_id` - Supabase Auth UUID
- `display_name` - From provider (editable)
- `avatar_url` - From provider
- `provider` - 'google' | 'facebook' | 'twitter'
- `provider_user_id` - Provider's user ID

**Computed/Tracked:**
- `all_time_points` - Sum of all points earned
- `created_at` - First login timestamp
- `last_active_at` - Last prediction or login

### Privacy Considerations

- Only display name and avatar are public
- Email never displayed or shared
- Provider info used for auth only
- Users can change display name
- No data sold or shared with third parties

---

## 4. Prediction System

### Prediction States

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PREDICTION LIFECYCLE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │
│   │  OPEN    │───▶│  LOCKED  │───▶│ RESOLVED │───▶│  SCORED  │    │
│   │          │    │          │    │          │    │          │    │
│   │ User can │    │ Can't    │    │ Outcome  │    │ Points   │    │
│   │ predict  │    │ change   │    │ known    │    │ awarded  │    │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘    │
│        │                │                │                │        │
│        │                │                │                │        │
│   departure -          departure -       actual          scoring   │
│   LOCK_WINDOW          0 min            outcome          job runs  │
│   (60 min)                              recorded                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Lock Window

**Definition:** Predictions lock 60 minutes before scheduled departure.

**Rationale:**
- Prevents last-minute gaming based on operator announcements
- Weather conditions largely known by this point
- Gives system time to process any late predictions

**Configuration:**

```typescript
// src/lib/social/constants.ts

export const PREDICTION_LOCK_MINUTES = 60;

export function isPredictionLocked(departureDateTimeUtc: string): boolean {
  const departureTime = new Date(departureDateTimeUtc).getTime();
  const lockTime = departureTime - (PREDICTION_LOCK_MINUTES * 60 * 1000);
  return Date.now() >= lockTime;
}
```

### Prediction Actions

| Action | Symbol | Meaning | Database Value |
|--------|--------|---------|----------------|
| Thumbs Up | 👍 | "Will sail" | `will_sail` |
| Thumbs Down | 👎 | "Will not sail" | `will_cancel` |

### Prediction Rules

1. **One prediction per user per sailing** - Enforced by unique constraint
2. **No edits** - Once submitted, prediction is immutable
3. **No deletes** - Predictions cannot be removed
4. **Lock enforcement** - API rejects predictions within lock window

### Prediction Data Captured

When a user makes a prediction, capture:

```typescript
interface PredictionSnapshot {
  // User & Sailing
  user_id: string;
  sailing_id: string;

  // User's Prediction
  prediction: 'will_sail' | 'will_cancel';
  predicted_at: string; // UTC timestamp

  // Likelihood at Prediction Time (for fair scoring)
  likelihood_at_prediction: number; // 0-100
  likelihood_confidence_at_prediction: 'high' | 'medium' | 'low';

  // Sailing Context
  scheduled_departure_utc: string;
  operator_id: string;
  corridor_id: string;
}
```

**Important:** `likelihood_at_prediction` is captured at submission time, NOT at scoring time. This ensures:
- Users can't wait for favorable odds
- Scoring is fair based on information available when predicting
- Time horizon bonus rewards early predictions

---

## 5. Scoring Logic

### Scoring Philosophy

1. **Higher uncertainty = higher reward** - Predicting a 50% sailing correctly is worth more than a 95% sailing
2. **Early predictions rewarded** - Predicting days ahead earns bonus points
3. **Only correct predictions score** - Wrong = 0 points, no negatives
4. **Deterministic** - Same inputs always produce same score
5. **Transparent** - Users can understand why they earned their score

### Base Score Formula

```
BASE_POINTS = 100

RISK_MULTIPLIER = calculateRiskMultiplier(likelihood_at_prediction, prediction_type)

TIME_MULTIPLIER = calculateTimeMultiplier(hours_before_departure)

FINAL_SCORE = floor(BASE_POINTS × RISK_MULTIPLIER × TIME_MULTIPLIER)
```

### Risk Multiplier Calculation

The risk multiplier rewards predictions that go against the odds.

```typescript
function calculateRiskMultiplier(
  likelihoodToRun: number, // 0-100
  predictionType: 'will_sail' | 'will_cancel'
): number {
  // Convert likelihood to probability (0-1)
  const pSail = likelihoodToRun / 100;
  const pCancel = 1 - pSail;

  // User's predicted probability
  const predictedProb = predictionType === 'will_sail' ? pSail : pCancel;

  // Risk multiplier: inverse of predicted probability
  // Lower probability predictions get higher multipliers
  //
  // predictedProb | multiplier
  // 0.90          | 1.11
  // 0.70          | 1.43
  // 0.50          | 2.00
  // 0.30          | 3.33
  // 0.10          | 10.00
  //
  // Cap at 10x to prevent extreme gaming
  const rawMultiplier = 1 / predictedProb;
  return Math.min(rawMultiplier, 10);
}
```

**Examples:**

| Likelihood | Prediction | Predicted Prob | Risk Multiplier |
|------------|------------|----------------|-----------------|
| 90% | Will Sail | 0.90 | 1.11× |
| 90% | Will Cancel | 0.10 | 10.00× |
| 70% | Will Sail | 0.70 | 1.43× |
| 70% | Will Cancel | 0.30 | 3.33× |
| 50% | Either | 0.50 | 2.00× |
| 30% | Will Sail | 0.30 | 3.33× |
| 30% | Will Cancel | 0.70 | 1.43× |

### Time Horizon Multiplier

Rewards predictions made further in advance.

```typescript
function calculateTimeMultiplier(hoursBeforeDeparture: number): number {
  // Tiers:
  // Same day (0-24h): 1.0×
  // 24-48h: 1.25×
  // 48-72h: 1.5×
  // 72h+: 2.0×

  if (hoursBeforeDeparture >= 72) return 2.0;
  if (hoursBeforeDeparture >= 48) return 1.5;
  if (hoursBeforeDeparture >= 24) return 1.25;
  return 1.0;
}
```

### Complete Scoring Function

```typescript
interface ScoringInput {
  prediction: 'will_sail' | 'will_cancel';
  actualOutcome: 'sailed' | 'canceled';
  likelihoodAtPrediction: number; // 0-100
  predictedAtUtc: string;
  scheduledDepartureUtc: string;
}

interface ScoringResult {
  points: number;
  correct: boolean;
  breakdown: {
    basePoints: number;
    riskMultiplier: number;
    timeMultiplier: number;
    hoursInAdvance: number;
  };
}

function scorePrediction(input: ScoringInput): ScoringResult {
  const BASE_POINTS = 100;

  // Check if prediction was correct
  const correct =
    (input.prediction === 'will_sail' && input.actualOutcome === 'sailed') ||
    (input.prediction === 'will_cancel' && input.actualOutcome === 'canceled');

  if (!correct) {
    return {
      points: 0,
      correct: false,
      breakdown: {
        basePoints: BASE_POINTS,
        riskMultiplier: 0,
        timeMultiplier: 0,
        hoursInAdvance: 0,
      },
    };
  }

  // Calculate hours before departure
  const predictedAt = new Date(input.predictedAtUtc).getTime();
  const departureAt = new Date(input.scheduledDepartureUtc).getTime();
  const hoursInAdvance = (departureAt - predictedAt) / (1000 * 60 * 60);

  // Calculate multipliers
  const riskMultiplier = calculateRiskMultiplier(
    input.likelihoodAtPrediction,
    input.prediction
  );
  const timeMultiplier = calculateTimeMultiplier(hoursInAdvance);

  // Final score (floored to integer)
  const points = Math.floor(BASE_POINTS * riskMultiplier * timeMultiplier);

  return {
    points,
    correct: true,
    breakdown: {
      basePoints: BASE_POINTS,
      riskMultiplier,
      timeMultiplier,
      hoursInAdvance,
    },
  };
}
```

### Scoring Examples

| Scenario | Likelihood | Prediction | Hours Ahead | Outcome | Points |
|----------|------------|------------|-------------|---------|--------|
| Easy correct | 95% sail | 👍 Sail | 2h | Sailed | 105 (100 × 1.05 × 1.0) |
| Risky correct | 30% sail | 👍 Sail | 2h | Sailed | 333 (100 × 3.33 × 1.0) |
| Early correct | 70% sail | 👍 Sail | 50h | Sailed | 214 (100 × 1.43 × 1.5) |
| Very early risky | 20% sail | 👎 Cancel | 80h | Canceled | 250 (100 × 1.25 × 2.0) |
| Wrong prediction | 90% sail | 👎 Cancel | 48h | Sailed | 0 |

### Anti-Gaming Measures

1. **Cap multiplier at 10×** - Prevents extreme odds gaming
2. **Snapshot likelihood at prediction time** - Can't wait for odds to shift
3. **Lock window** - Can't predict after operator announces status
4. **One prediction per sailing** - Can't hedge with multiple accounts (audit trail)
5. **Deterministic scoring** - No randomness to exploit

---

## 6. Daily Crown System

### Crown Rules

1. User with highest daily points becomes the **Daily Crown Holder**
2. Crown is assigned after midnight UTC
3. Crown is displayed for exactly 24 hours
4. Crown appears next to username everywhere it's shown

### Daily Cycle

```
Day 1                          Day 2                          Day 3
──────────────────────────────────────────────────────────────────────►
                                                                  time
00:00 UTC                     00:00 UTC                     00:00 UTC
    │                             │                             │
    ▼                             ▼                             ▼
┌─────────┐                 ┌─────────┐                 ┌─────────┐
│ Crown   │                 │ Crown   │                 │ Crown   │
│ assigned│                 │ assigned│                 │ assigned│
│ for     │                 │ for     │                 │ for     │
│ Day 0   │                 │ Day 1   │                 │ Day 2   │
│ winner  │                 │ winner  │                 │ winner  │
└─────────┘                 └─────────┘                 └─────────┘
    │                             │
    │◄── User A wears crown ────►│◄── User B wears crown ────►│
         (24 hours)                    (24 hours)
```

### Crown Assignment Logic

```typescript
interface CrownAssignmentResult {
  date: string; // YYYY-MM-DD (the day that just ended)
  winner_user_id: string | null;
  winner_display_name: string | null;
  winning_points: number;
  total_participants: number;
  runner_up_user_id: string | null;
  runner_up_points: number | null;
}

async function assignDailyCrown(dateUtc: string): Promise<CrownAssignmentResult> {
  // Get daily leaderboard for the specified date
  const leaderboard = await getDailyLeaderboard(dateUtc, { limit: 2 });

  if (leaderboard.length === 0) {
    // No predictions scored that day
    return {
      date: dateUtc,
      winner_user_id: null,
      winner_display_name: null,
      winning_points: 0,
      total_participants: 0,
      runner_up_user_id: null,
      runner_up_points: null,
    };
  }

  const winner = leaderboard[0];
  const runnerUp = leaderboard[1] || null;

  // Insert crown record
  await insertCrownWinner({
    date: dateUtc,
    user_id: winner.user_id,
    points: winner.daily_points,
  });

  return {
    date: dateUtc,
    winner_user_id: winner.user_id,
    winner_display_name: winner.display_name,
    winning_points: winner.daily_points,
    total_participants: await countDailyParticipants(dateUtc),
    runner_up_user_id: runnerUp?.user_id || null,
    runner_up_points: runnerUp?.daily_points || null,
  };
}
```

### Tie-Breaking Rules

When multiple users have the same daily points:

1. **First tiebreaker:** Most predictions made that day (higher activity)
2. **Second tiebreaker:** Earliest first prediction timestamp (rewarded for being first)
3. **Third tiebreaker:** Lower user_id (arbitrary but deterministic)

```sql
ORDER BY
  daily_points DESC,
  prediction_count DESC,
  first_prediction_at ASC,
  user_id ASC
LIMIT 1
```

### Crown Display

The crown holder has a 👑 emoji displayed:
- Next to their name in leaderboards
- On their profile
- On trip cards where they've made predictions
- In the crown winner announcement modal

### Cron Job Schedule

```typescript
// Runs at 00:05 UTC daily (5 min buffer for late scoring)
// vercel.json
{
  "crons": [
    {
      "path": "/api/social/crown/assign",
      "schedule": "5 0 * * *"
    }
  ]
}
```

---

## 7. Leaderboards

### Leaderboard Types

| Type | Scope | Reset | Primary Use |
|------|-------|-------|-------------|
| Daily | Points earned today (UTC) | Midnight UTC | Competition, crown |
| All-Time | Total points ever | Never | Long-term engagement |

### Leaderboard Data Structure

```typescript
interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  points: number;
  prediction_count: number;
  accuracy_pct: number; // correct / total × 100
  has_crown: boolean; // Is current crown holder
  is_current_user: boolean; // Highlight for logged-in user
}

interface LeaderboardResponse {
  type: 'daily' | 'all_time';
  date?: string; // For daily, which date
  entries: LeaderboardEntry[];
  current_user_rank?: number; // User's rank if not in top N
  total_participants: number;
}
```

### Query Optimization

**Daily Leaderboard View (Materialized or Regular):**

```sql
-- social_daily_leaderboard view
CREATE VIEW ferry_forecast.social_daily_leaderboard AS
SELECT
  u.user_id,
  u.display_name,
  u.avatar_url,
  dp.date_utc,
  dp.points AS daily_points,
  dp.prediction_count,
  dp.correct_count,
  ROUND(dp.correct_count::numeric / NULLIF(dp.prediction_count, 0) * 100, 1) AS accuracy_pct,
  RANK() OVER (PARTITION BY dp.date_utc ORDER BY dp.points DESC) AS rank
FROM ferry_forecast.social_daily_points dp
JOIN ferry_forecast.social_users u ON u.user_id = dp.user_id
WHERE dp.points > 0;
```

**All-Time Leaderboard View:**

```sql
-- social_alltime_leaderboard view
CREATE VIEW ferry_forecast.social_alltime_leaderboard AS
SELECT
  u.user_id,
  u.display_name,
  u.avatar_url,
  u.all_time_points,
  u.total_predictions,
  u.correct_predictions,
  ROUND(u.correct_predictions::numeric / NULLIF(u.total_predictions, 0) * 100, 1) AS accuracy_pct,
  RANK() OVER (ORDER BY u.all_time_points DESC) AS rank
FROM ferry_forecast.social_users u
WHERE u.all_time_points > 0;
```

### Indexes

```sql
-- For daily leaderboard queries
CREATE INDEX idx_daily_points_date_points
ON ferry_forecast.social_daily_points (date_utc, points DESC);

-- For all-time leaderboard queries
CREATE INDEX idx_users_all_time_points
ON ferry_forecast.social_users (all_time_points DESC);

-- For user's own rank lookup
CREATE INDEX idx_daily_points_user_date
ON ferry_forecast.social_daily_points (user_id, date_utc);
```

### Performance Considerations

1. **Pagination** - Return top 50, allow scrolling
2. **Caching** - Cache leaderboard for 60 seconds (acceptable staleness)
3. **User rank** - If user not in top N, compute their rank separately
4. **Materialized views** - Consider for all-time if scale warrants

---

## 8. Notifications & Sharing

### In-App Notifications

**Crown Win Notification:**

Triggered when crown assignment job runs and user is the winner.

```typescript
interface CrownWinNotification {
  type: 'crown_win';
  date: string;
  points_earned: number;
  rank: 1;
  total_participants: number;
  runner_up_points: number | null;
}
```

**Display:** Modal on next page load/visit

### Crown Win Modal Content

```
┌─────────────────────────────────────────┐
│                                         │
│           👑                            │
│     You're Today's                      │
│   Ferry Forecast Champion!              │
│                                         │
│   ─────────────────────────────         │
│                                         │
│   Points Earned: 847                    │
│   Rank: #1 of 156 players               │
│   Accuracy: 78%                         │
│                                         │
│   ─────────────────────────────         │
│                                         │
│   [Share on Facebook]    [Close]        │
│                                         │
└─────────────────────────────────────────┘
```

### Facebook Share Integration

**Share Dialog (not auto-post):**

```typescript
interface FacebookShareConfig {
  url: string; // Link to user's profile or leaderboard
  quote: string; // Pre-filled text
}

function shareToFacebook(config: FacebookShareConfig) {
  const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(config.url)}&quote=${encodeURIComponent(config.quote)}`;
  window.open(shareUrl, '_blank', 'width=600,height=400');
}

// Example usage
shareToFacebook({
  url: 'https://istheferryrunning.com/leaderboard',
  quote: "I just won today's Ferry Forecast Crown! 👑 Can you predict ferry sailings better than me?",
});
```

**Share Copy Guidelines:**

DO use:
- "Won the crown"
- "Predict ferry sailings"
- "Challenge your friends"
- "Ferry Forecast Champion"

DO NOT use:
- "Bet"
- "Wager"
- "Odds"
- "Gamble"
- "Win money"
- "Prize"

### Notification Storage

**Lightweight approach:** Store pending notifications in `social_users` table:

```sql
ALTER TABLE ferry_forecast.social_users
ADD COLUMN pending_notification JSONB DEFAULT NULL;
```

- Set when crown assigned
- Clear when modal dismissed
- Check on page load if user authenticated

---

## 9. Database Schema

### Entity Relationship Diagram

```
┌──────────────────────┐     ┌──────────────────────┐
│    social_users      │     │ social_predictions   │
├──────────────────────┤     ├──────────────────────┤
│ user_id (PK)         │◄────│ user_id (FK)         │
│ auth_user_id (FK)    │     │ prediction_id (PK)   │
│ display_name         │     │ sailing_id           │
│ avatar_url           │     │ prediction           │
│ provider             │     │ predicted_at         │
│ all_time_points      │     │ likelihood_snapshot  │
│ total_predictions    │     │ ...                  │
│ correct_predictions  │     └──────────┬───────────┘
│ created_at           │                │
│ pending_notification │                │
└──────────┬───────────┘                │
           │                            │
           │     ┌──────────────────────▼───────────┐
           │     │      social_point_events         │
           │     ├──────────────────────────────────┤
           │     │ event_id (PK)                    │
           │     │ user_id (FK)                     │
           │     │ prediction_id (FK)               │
           │     │ points_awarded                   │
           │     │ scoring_breakdown (JSONB)        │
           │     │ scored_at                        │
           │     └──────────────────────────────────┘
           │
           │     ┌──────────────────────────────────┐
           ├────►│      social_daily_points         │
           │     ├──────────────────────────────────┤
           │     │ user_id (FK, PK)                 │
           │     │ date_utc (PK)                    │
           │     │ points                           │
           │     │ prediction_count                 │
           │     │ correct_count                    │
           │     └──────────────────────────────────┘
           │
           │     ┌──────────────────────────────────┐
           └────►│     social_crown_winners         │
                 ├──────────────────────────────────┤
                 │ date_utc (PK)                    │
                 │ user_id (FK)                     │
                 │ points                           │
                 │ assigned_at                      │
                 └──────────────────────────────────┘
```

### Table Definitions

#### social_users

```sql
CREATE TABLE ferry_forecast.social_users (
  -- Primary key
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to Supabase Auth
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Profile info (from OAuth)
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  provider VARCHAR(20) NOT NULL, -- 'google', 'facebook', 'twitter'
  provider_user_id VARCHAR(255),

  -- Aggregate stats (denormalized for performance)
  all_time_points INTEGER NOT NULL DEFAULT 0,
  total_predictions INTEGER NOT NULL DEFAULT 0,
  correct_predictions INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Notification queue
  pending_notification JSONB DEFAULT NULL,

  -- Constraints
  CONSTRAINT valid_provider CHECK (provider IN ('google', 'facebook', 'twitter'))
);

-- Indexes
CREATE INDEX idx_social_users_auth ON ferry_forecast.social_users(auth_user_id);
CREATE INDEX idx_social_users_points ON ferry_forecast.social_users(all_time_points DESC);
```

#### social_predictions

```sql
CREATE TABLE ferry_forecast.social_predictions (
  -- Primary key
  prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  user_id UUID NOT NULL REFERENCES ferry_forecast.social_users(user_id) ON DELETE CASCADE,

  -- Sailing identification
  sailing_id VARCHAR(200) NOT NULL, -- Format: "{operator}_{origin}_{dest}_{time}"
  scheduled_departure_utc TIMESTAMPTZ NOT NULL,
  operator_id VARCHAR(50) NOT NULL,
  corridor_id VARCHAR(100) NOT NULL,

  -- User's prediction
  prediction VARCHAR(20) NOT NULL, -- 'will_sail' or 'will_cancel'
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Likelihood snapshot at prediction time
  likelihood_at_prediction SMALLINT NOT NULL, -- 0-100
  likelihood_confidence_at_prediction VARCHAR(10) NOT NULL, -- 'high', 'medium', 'low'

  -- Outcome tracking
  outcome VARCHAR(20), -- 'sailed', 'canceled', NULL if unknown
  outcome_recorded_at TIMESTAMPTZ,

  -- Scoring
  is_scored BOOLEAN NOT NULL DEFAULT FALSE,
  points_awarded INTEGER,
  scored_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_prediction CHECK (prediction IN ('will_sail', 'will_cancel')),
  CONSTRAINT valid_outcome CHECK (outcome IS NULL OR outcome IN ('sailed', 'canceled')),
  CONSTRAINT valid_likelihood CHECK (likelihood_at_prediction BETWEEN 0 AND 100),
  CONSTRAINT unique_user_sailing UNIQUE (user_id, sailing_id)
);

-- Indexes
CREATE INDEX idx_predictions_user ON ferry_forecast.social_predictions(user_id);
CREATE INDEX idx_predictions_sailing ON ferry_forecast.social_predictions(sailing_id);
CREATE INDEX idx_predictions_unscored ON ferry_forecast.social_predictions(is_scored, scheduled_departure_utc)
  WHERE is_scored = FALSE;
CREATE INDEX idx_predictions_user_date ON ferry_forecast.social_predictions(user_id, DATE(predicted_at AT TIME ZONE 'UTC'));
```

#### social_point_events

```sql
CREATE TABLE ferry_forecast.social_point_events (
  -- Primary key
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  user_id UUID NOT NULL REFERENCES ferry_forecast.social_users(user_id) ON DELETE CASCADE,
  prediction_id UUID NOT NULL UNIQUE REFERENCES ferry_forecast.social_predictions(prediction_id) ON DELETE CASCADE,

  -- Scoring result
  points_awarded INTEGER NOT NULL,
  correct BOOLEAN NOT NULL,

  -- Scoring breakdown (for transparency/debugging)
  scoring_breakdown JSONB NOT NULL,
  -- Example: {"base": 100, "risk_mult": 2.5, "time_mult": 1.5, "hours_ahead": 52}

  -- Timestamps
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Date partition key (UTC date of the prediction)
  date_utc DATE NOT NULL
);

-- Indexes
CREATE INDEX idx_point_events_user_date ON ferry_forecast.social_point_events(user_id, date_utc);
CREATE INDEX idx_point_events_date ON ferry_forecast.social_point_events(date_utc);
```

#### social_daily_points

```sql
CREATE TABLE ferry_forecast.social_daily_points (
  -- Composite primary key
  user_id UUID NOT NULL REFERENCES ferry_forecast.social_users(user_id) ON DELETE CASCADE,
  date_utc DATE NOT NULL,

  -- Aggregates
  points INTEGER NOT NULL DEFAULT 0,
  prediction_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,

  -- For tiebreaking
  first_prediction_at TIMESTAMPTZ,

  PRIMARY KEY (user_id, date_utc)
);

-- Indexes
CREATE INDEX idx_daily_points_leaderboard ON ferry_forecast.social_daily_points(date_utc, points DESC, prediction_count DESC);
```

#### social_crown_winners

```sql
CREATE TABLE ferry_forecast.social_crown_winners (
  -- Primary key (one crown per day)
  date_utc DATE PRIMARY KEY,

  -- Winner (nullable for days with no activity)
  user_id UUID REFERENCES ferry_forecast.social_users(user_id) ON DELETE SET NULL,
  points INTEGER NOT NULL,

  -- Metadata
  total_participants INTEGER NOT NULL DEFAULT 0,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for checking current crown holder
CREATE INDEX idx_crown_user ON ferry_forecast.social_crown_winners(user_id);
```

### Example Data

#### social_users

| user_id | display_name | avatar_url | provider | all_time_points | total_predictions |
|---------|--------------|------------|----------|-----------------|-------------------|
| abc-123 | CaptainJack | https://... | google | 4,250 | 89 |
| def-456 | IslandHopper | https://... | facebook | 3,180 | 67 |
| ghi-789 | FerryFan2024 | NULL | google | 1,420 | 42 |

#### social_predictions

| prediction_id | user_id | sailing_id | prediction | likelihood_at_prediction | outcome | points_awarded |
|---------------|---------|------------|------------|--------------------------|---------|----------------|
| p-001 | abc-123 | ssa_wh_vh_0930 | will_sail | 85 | sailed | 118 |
| p-002 | abc-123 | ssa_wh_vh_1430 | will_cancel | 72 | sailed | 0 |
| p-003 | def-456 | ssa_wh_vh_0930 | will_sail | 85 | sailed | 118 |

#### social_daily_points

| user_id | date_utc | points | prediction_count | correct_count |
|---------|----------|--------|------------------|---------------|
| abc-123 | 2026-01-08 | 847 | 12 | 9 |
| def-456 | 2026-01-08 | 723 | 10 | 8 |
| abc-123 | 2026-01-09 | 156 | 3 | 2 |

#### social_crown_winners

| date_utc | user_id | points | total_participants |
|----------|---------|--------|-------------------|
| 2026-01-07 | def-456 | 912 | 45 |
| 2026-01-08 | abc-123 | 847 | 52 |

---

## 10. User Flows

### Flow 1: First-Time User Onboarding

```
1. User views sailing card on corridor page
   └─▶ Sees "Connect to Play" button (feature flag enabled)

2. User clicks "Connect to Play"
   └─▶ Modal appears with provider options (Google, Facebook)

3. User selects Google
   └─▶ Redirected to Google OAuth consent screen

4. User grants permissions
   └─▶ Redirected back to /api/social/auth/callback

5. Callback handler:
   a. Validates OAuth response
   b. Creates Supabase Auth user
   c. Creates social_users record with:
      - display_name from Google profile
      - avatar_url from Google profile
      - provider = 'google'
      - all_time_points = 0
   d. Sets session cookie

6. User redirected to original page
   └─▶ Now sees prediction UI instead of "Connect to Play"

7. Welcome toast appears:
   "Welcome, [Name]! Make your first prediction to start earning points."
```

### Flow 2: Making a Prediction

```
1. User views sailing card
   └─▶ Departure: 2:30 PM (3 hours away)
   └─▶ Likelihood: 72% will sail
   └─▶ Shows: 👍 and 👎 buttons

2. User clicks 👎 (Will Cancel)
   └─▶ Confirmation prompt:
       "Predict this sailing will be CANCELED?
        This cannot be changed."

3. User confirms
   └─▶ API POST /api/social/predictions
   └─▶ Server validates:
       a. User authenticated ✓
       b. Sailing exists ✓
       c. Not within lock window (60 min) ✓
       d. No existing prediction for this sailing ✓

4. Prediction created:
   - Captures likelihood_at_prediction = 72
   - Captures predicted_at = current time
   - Sets prediction = 'will_cancel'

5. UI updates:
   └─▶ Shows "Your prediction: Will Cancel 👎"
   └─▶ Buttons replaced with locked indicator
   └─▶ Optional: "See how others predicted" link

6. User sees prediction reflected immediately
   └─▶ Can navigate away, prediction is saved
```

### Flow 3: Prediction Resolution & Scoring

```
1. Sailing departure time passes
   └─▶ sailing_events table updated with actual outcome

2. Scoring cron job runs (every 15 min)
   └─▶ Queries predictions WHERE:
       - is_scored = FALSE
       - scheduled_departure_utc < NOW() - 1 hour
       - outcome IS NOT NULL (from sailing_events)

3. For each unscored prediction:
   a. Fetch actual outcome from sailing_events
   b. Calculate score using:
      - likelihood_at_prediction
      - predicted_at
      - scheduled_departure_utc
      - actual outcome
   c. Insert social_point_events record
   d. Update prediction: is_scored = TRUE, points_awarded = X
   e. Update social_daily_points (increment or insert)
   f. Update social_users.all_time_points

4. User's next visit shows updated points
   └─▶ Profile panel shows new totals
   └─▶ Leaderboard reflects new rankings
```

### Flow 4: Winning the Daily Crown

```
1. End of day (midnight UTC approaches)
   └─▶ User "CaptainJack" has 847 daily points
   └─▶ Nearest competitor has 723 points

2. Crown assignment cron runs at 00:05 UTC
   └─▶ Queries social_daily_points for previous day
   └─▶ Finds CaptainJack as top scorer
   └─▶ Inserts social_crown_winners record
   └─▶ Sets CaptainJack's pending_notification

3. CaptainJack opens app the next day
   └─▶ App checks pending_notification
   └─▶ Crown Win Modal appears:
       "👑 You're Today's Ferry Forecast Champion!
        Points: 847 | Rank: #1 of 156"
       [Share on Facebook] [Close]

4. CaptainJack clicks "Share on Facebook"
   └─▶ Facebook share dialog opens (not auto-post)
   └─▶ Pre-filled: "I won today's Ferry Forecast Crown! 👑"

5. CaptainJack closes modal
   └─▶ pending_notification cleared
   └─▶ 👑 appears next to name for 24 hours

6. Other users see:
   └─▶ Leaderboard shows CaptainJack with 👑
   └─▶ Predictions from CaptainJack show 👑
```

### Flow 5: Checking Leaderboards

```
1. User clicks "Leaderboard" in navigation
   └─▶ /leaderboard page loads

2. Default: Daily leaderboard
   └─▶ API GET /api/social/leaderboard?type=daily
   └─▶ Shows today's rankings

3. Display:
   ┌─────────────────────────────────────────┐
   │  Daily Leaderboard (Jan 9, 2026)        │
   │  ────────────────────────────────────   │
   │  1. 👑 CaptainJack      847 pts  78%    │
   │  2.    IslandHopper     723 pts  80%    │
   │  3.    FerryFan2024     612 pts  71%    │
   │  ...                                     │
   │  ► 47. You (WaveRider)  156 pts  67%    │
   │  ────────────────────────────────────   │
   │  [Daily] [All-Time]                      │
   └─────────────────────────────────────────┘

4. User clicks "All-Time"
   └─▶ API GET /api/social/leaderboard?type=all_time
   └─▶ Shows all-time rankings
   └─▶ Different order based on cumulative points
```

---

## 11. UI/UX Components

### A. Trip Card with Prediction UI

**States:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ STATE 1: Not Authenticated                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  9:30 AM → Vineyard Haven         72% likely to sail               │
│  SSA Traditional Ferry            Wind: 15 mph SW                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │          [Connect to Play 🎮]                                │   │
│  │     Sign in to predict if this ferry will sail               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STATE 2: Authenticated, Can Predict                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  9:30 AM → Vineyard Haven         72% likely to sail               │
│  SSA Traditional Ferry            Wind: 15 mph SW                   │
│                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐                │
│  │     👍 Will Sail     │  │   👎 Will Cancel     │                │
│  └──────────────────────┘  └──────────────────────┘                │
│                                                                     │
│  Predictions lock in 2h 45m                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STATE 3: User Has Predicted                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  9:30 AM → Vineyard Haven         72% likely to sail               │
│  SSA Traditional Ferry            Wind: 15 mph SW                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Your prediction: 👎 Will Cancel                             │   │
│  │  Predicted 2 days ago • Locked                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STATE 4: Predictions Locked (Within Lock Window)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  9:30 AM → Vineyard Haven         72% likely to sail               │
│  SSA Traditional Ferry            Wind: 15 mph SW                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  🔒 Predictions closed                                       │   │
│  │  Departing in 45 minutes                                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STATE 5: Resolved - User Won Points                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  9:30 AM → Vineyard Haven         CANCELED                         │
│  SSA Traditional Ferry            High winds                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ✅ You predicted correctly! +285 points                     │   │
│  │  👎 Will Cancel • Risk: 3.3× • Time: 1.5×                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STATE 6: Resolved - User Was Wrong                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  9:30 AM → Vineyard Haven         ON TIME                          │
│  SSA Traditional Ferry            Departed normally                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ❌ Prediction incorrect • 0 points                          │   │
│  │  You predicted: 👎 Will Cancel                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### B. User Profile Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PROFILE PANEL                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│      ┌──────┐                                                       │
│      │ 🖼️  │  CaptainJack 👑                                       │
│      │avatar│  via Google                                           │
│      └──────┘                                                       │
│                                                                     │
│  ─────────────────────────────────────────────────────────────      │
│                                                                     │
│  All-Time Points         4,250                                      │
│  Today's Points            156                                      │
│  Predictions Made           89                                      │
│  Accuracy                  72%                                      │
│                                                                     │
│  ─────────────────────────────────────────────────────────────      │
│                                                                     │
│  Recent Predictions                                                 │
│  • 9:30 AM WH→VH: 👎 +285 pts ✅                                   │
│  • 11:00 AM WH→VH: 👍 +118 pts ✅                                  │
│  • 2:30 PM WH→VH: 👎 0 pts ❌                                      │
│                                                                     │
│  [View All Predictions]                                             │
│                                                                     │
│  ─────────────────────────────────────────────────────────────      │
│                                                                     │
│  [Edit Display Name]  [Sign Out]                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### C. Leaderboard Page

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LEADERBOARD                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────┐  ┌────────────────────┐                    │
│  │ ● Daily            │  │   All-Time         │                    │
│  └────────────────────┘  └────────────────────┘                    │
│                                                                     │
│  January 9, 2026 • 156 players                                      │
│                                                                     │
│  ─────────────────────────────────────────────────────────────      │
│                                                                     │
│  #1  👑  ┌──┐  CaptainJack       847 pts   78% acc   12 pred       │
│          │🖼│                                                       │
│          └──┘                                                       │
│                                                                     │
│  #2      ┌──┐  IslandHopper      723 pts   80% acc   10 pred       │
│          │🖼│                                                       │
│          └──┘                                                       │
│                                                                     │
│  #3      ┌──┐  FerryFan2024      612 pts   71% acc   14 pred       │
│          │🖼│                                                       │
│          └──┘                                                       │
│                                                                     │
│  ... (scrollable list)                                              │
│                                                                     │
│  ─────────────────────────────────────────────────────────────      │
│                                                                     │
│  #47 ►   ┌──┐  You (WaveRider)   156 pts   67% acc   3 pred        │
│          │🖼│  ← Your rank                                          │
│          └──┘                                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### D. Crown Win Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                              👑                                     │
│                                                                     │
│                   You're Today's                                    │
│                Ferry Forecast Champion!                             │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│                   January 8, 2026                                   │
│                                                                     │
│        Points Earned            847                                 │
│        Your Rank             #1 of 156                              │
│        Predictions              12                                  │
│        Accuracy                 78%                                 │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│       Your crown will be displayed for the next 24 hours.          │
│       Can you defend it tomorrow?                                   │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│    ┌──────────────────────┐    ┌──────────────────────┐            │
│    │  Share on Facebook   │    │       Close          │            │
│    │         📘          │    │                      │            │
│    └──────────────────────┘    └──────────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### E. Connect to Play Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                   Play the Prediction Game                          │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│       Think you can predict ferry cancellations?                    │
│       Connect your account to start earning points!                 │
│                                                                     │
│       ✓ Predict if ferries will sail or cancel                     │
│       ✓ Earn points for correct predictions                        │
│       ✓ Compete for the daily crown 👑                             │
│       ✓ See how you rank against other players                     │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│    ┌──────────────────────────────────────────────────────────┐    │
│    │               Continue with Google                        │    │
│    │                      🔵 G                                 │    │
│    └──────────────────────────────────────────────────────────┘    │
│                                                                     │
│    ┌──────────────────────────────────────────────────────────┐    │
│    │              Continue with Facebook                       │    │
│    │                      📘 f                                 │    │
│    └──────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│                          [Cancel]                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Non-intrusive** - Social features enhance, don't obstruct ferry info
2. **Clear states** - User always knows if they can/can't predict
3. **Immediate feedback** - Predictions confirmed instantly
4. **Transparent scoring** - Breakdown shown for earned points
5. **Celebratory but tasteful** - Crown win is exciting, not gambling-like
6. **Mobile-first** - All components work on small screens
7. **Accessible** - Proper ARIA labels, keyboard navigation

### Color Palette (Extending Existing)

| Element | Color | Usage |
|---------|-------|-------|
| Thumbs Up | `green-500` | Will sail prediction |
| Thumbs Down | `red-500` | Will cancel prediction |
| Crown | `yellow-400` | Winner indicator |
| Correct | `green-600` | Correct prediction result |
| Incorrect | `gray-400` | Wrong prediction result |
| Locked | `gray-300` | Disabled state |
| Points | `blue-600` | Point values |

---

## 12. Edge Cases & Safeguards

### Prediction Edge Cases

| Scenario | Handling |
|----------|----------|
| User predicts at 59m before departure | Allow (just inside window) |
| User predicts at 60m before departure | Reject with "Predictions closed" |
| User tries to predict twice | Reject with "Already predicted" |
| User predicts, then sailing is rescheduled | Honor original prediction time; score against new outcome |
| Sailing has no likelihood data | Use 50% as default; flag as `likelihood_confidence: 'low'` |
| User disconnects mid-prediction | Transaction rollback; can retry |

### Scoring Edge Cases

| Scenario | Handling |
|----------|----------|
| Outcome never recorded (data gap) | Mark prediction as `outcome: 'unknown'`; no points |
| Outcome recorded late (>24h) | Still score normally |
| Same sailing ID appears twice | Use most recent sailing_events record |
| Likelihood was 0% and user predicted sail | Cap risk multiplier at 10× |
| Likelihood was 100% and user predicted cancel | Cap risk multiplier at 10× |

### Crown Edge Cases

| Scenario | Handling |
|----------|----------|
| Tie for first place | Apply tiebreakers (see Section 6) |
| No predictions scored that day | No crown awarded; record NULL winner |
| Winner deletes account | Crown record preserved with NULL user_id |
| Cron job fails | Manual retry endpoint; idempotent design |
| Multiple cron runs same day | Check if crown already assigned; skip if so |

### Time Zone Consistency

| Component | Time Zone | Rationale |
|-----------|-----------|-----------|
| Daily reset | UTC | Consistent global boundary |
| Prediction timestamps | UTC | Storage consistency |
| Display times | User's local | UX clarity |
| Lock window calc | UTC | Server-side consistency |
| Leaderboard date | UTC | Matches daily reset |

### Data Integrity Safeguards

1. **Idempotent scoring** - Scoring same prediction twice returns same result
2. **Transaction wrapping** - Point events + user update in single transaction
3. **Audit trail** - `social_point_events` preserves all scoring decisions
4. **Soft deletes** - User deletion preserves historical records (anonymized)
5. **Duplicate prevention** - Unique constraints on (user_id, sailing_id)

### Feature Flag Safeguards

When disabled (`NEXT_PUBLIC_SOCIAL_PREDICTIONS_ENABLED=false`):

| Component | Behavior |
|-----------|----------|
| API routes | Return 404 |
| UI components | Return null/fallback |
| Cron jobs | Exit early, no-op |
| Database queries | Not executed |
| Auth flows | Not accessible |

### Safe Retry Design

```typescript
// Crown assignment is idempotent
async function assignDailyCrown(dateUtc: string) {
  // Check if already assigned
  const existing = await getCrownForDate(dateUtc);
  if (existing) {
    return { status: 'already_assigned', crown: existing };
  }

  // Proceed with assignment
  // ... (rest of logic)
}
```

---

## 13. Implementation Checklist

### Phase 1: Foundation (Feature Flag + Auth)

- [ ] **Feature flag infrastructure**
  - [ ] Create `src/lib/social/feature-flag.ts`
  - [ ] Create `SocialGate` component
  - [ ] Add API route guard function
  - [ ] Test flag toggling in local/preview/prod

- [ ] **Supabase Auth configuration**
  - [ ] Enable Google OAuth in Supabase dashboard
  - [ ] Enable Facebook OAuth in Supabase dashboard
  - [ ] Configure OAuth callback URLs
  - [ ] Test auth flow end-to-end

- [ ] **Database schema**
  - [ ] Create migration for `social_users` table
  - [ ] Create migration for `social_predictions` table
  - [ ] Create migration for `social_point_events` table
  - [ ] Create migration for `social_daily_points` table
  - [ ] Create migration for `social_crown_winners` table
  - [ ] Create indexes
  - [ ] Run migrations in development

### Phase 2: Core Prediction Flow

- [ ] **API routes**
  - [ ] `POST /api/social/auth/callback` - OAuth callback
  - [ ] `GET /api/social/profile` - Get user profile
  - [ ] `PATCH /api/social/profile` - Update display name
  - [ ] `POST /api/social/predictions` - Create prediction
  - [ ] `GET /api/social/predictions` - List user's predictions

- [ ] **Prediction logic**
  - [ ] `isPredictionLocked()` utility
  - [ ] Likelihood snapshot capture
  - [ ] Validation rules (one per sailing, auth required, etc.)

- [ ] **UI components**
  - [ ] `ConnectToPlayButton` - Auth CTA
  - [ ] `ConnectToPlayModal` - Provider picker
  - [ ] `PredictionButtons` - Thumbs up/down
  - [ ] `PredictionStatus` - Locked/predicted states
  - [ ] Integrate into sailing cards

### Phase 3: Scoring System

- [ ] **Scoring logic**
  - [ ] `calculateRiskMultiplier()` function
  - [ ] `calculateTimeMultiplier()` function
  - [ ] `scorePrediction()` main function
  - [ ] Unit tests for scoring edge cases

- [ ] **Scoring API**
  - [ ] `POST /api/social/predictions/score` - Cron endpoint
  - [ ] Add to `vercel.json` crons
  - [ ] Test with manual triggers

- [ ] **Outcome integration**
  - [ ] Query `sailing_events` for outcomes
  - [ ] Handle missing outcomes gracefully
  - [ ] Update prediction records after scoring

### Phase 4: Leaderboards

- [ ] **Database views**
  - [ ] Create daily leaderboard view
  - [ ] Create all-time leaderboard view
  - [ ] Test query performance

- [ ] **Leaderboard API**
  - [ ] `GET /api/social/leaderboard?type=daily`
  - [ ] `GET /api/social/leaderboard?type=all_time`
  - [ ] Include user's rank if authenticated

- [ ] **Leaderboard UI**
  - [ ] `LeaderboardPage` component
  - [ ] `LeaderboardEntry` component
  - [ ] Daily/All-Time toggle
  - [ ] Current user highlight
  - [ ] Crown indicator

### Phase 5: Crown System

- [ ] **Crown assignment**
  - [ ] `POST /api/social/crown/assign` - Cron endpoint
  - [ ] Tiebreaker logic
  - [ ] Add to `vercel.json` crons (00:05 UTC)

- [ ] **Crown API**
  - [ ] `GET /api/social/crown` - Current holder

- [ ] **Crown UI**
  - [ ] Crown emoji display logic
  - [ ] `CrownWinModal` component
  - [ ] Notification check on load
  - [ ] Notification dismissal

### Phase 6: Sharing & Polish

- [ ] **Facebook sharing**
  - [ ] Share dialog integration
  - [ ] Copy/messaging review
  - [ ] Test on mobile

- [ ] **User profile UI**
  - [ ] `UserProfilePanel` component
  - [ ] Recent predictions list
  - [ ] Stats display
  - [ ] Edit display name flow

- [ ] **Resolved prediction UI**
  - [ ] Points breakdown display
  - [ ] Correct/incorrect indicators
  - [ ] Historical predictions view

### Phase 7: Testing & Launch Prep

- [ ] **Testing**
  - [ ] Unit tests for scoring
  - [ ] Integration tests for API routes
  - [ ] E2E tests for prediction flow
  - [ ] E2E tests for crown assignment
  - [ ] Load testing for leaderboards

- [ ] **Documentation**
  - [ ] User-facing FAQ/help
  - [ ] Terms of service updates (no gambling)
  - [ ] Privacy policy updates

- [ ] **Launch**
  - [ ] Code review
  - [ ] Merge to main (flag off)
  - [ ] Enable in preview environment
  - [ ] QA in preview
  - [ ] Enable in production
  - [ ] Monitor for issues

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Prediction | A user's forecast of whether a sailing will run or be canceled |
| Likelihood | System-calculated probability that a sailing will run (0-100%) |
| Risk Multiplier | Score bonus based on going against high-confidence predictions |
| Time Multiplier | Score bonus for predicting further in advance |
| Lock Window | Period before departure when predictions are no longer accepted |
| Daily Crown | Award given to the top scorer each day |
| Sailing | A single scheduled ferry departure |
| Outcome | The actual result of a sailing (sailed/canceled) |

## Appendix B: API Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/social/auth/callback` | None | OAuth callback handler |
| GET | `/api/social/profile` | Required | Get current user's profile |
| PATCH | `/api/social/profile` | Required | Update display name |
| POST | `/api/social/predictions` | Required | Create a prediction |
| GET | `/api/social/predictions` | Required | List user's predictions |
| POST | `/api/social/predictions/score` | Cron | Score resolved predictions |
| GET | `/api/social/leaderboard` | Optional | Get leaderboard |
| GET | `/api/social/crown` | None | Get current crown holder |
| POST | `/api/social/crown/assign` | Cron | Assign daily crown |

---

*Document Version: 1.0*
*Created: 2026-01-09*
*Author: Claude (AI Assistant)*
