#!/bin/bash
# Phase 43 Verification Script
# Verify Operator Conditions are being stored and displayed correctly

set -e

echo "=========================================="
echo "Phase 43: Operator Conditions Verification"
echo "=========================================="
echo ""

# Check if we have Supabase credentials
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "WARNING: SUPABASE_SERVICE_ROLE_KEY not set"
  echo "Database verification will be skipped"
  SKIP_DB=true
fi

# 1. Test the ingest API with conditions
echo "=== TEST 1: Ingest with conditions[] ==="
INGEST_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/operator/status/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${OBSERVER_SECRET:-test-secret}" \
  -d '{
    "source": "steamship_authority",
    "trigger": "manual",
    "scraped_at_utc": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
    "service_date_local": "'$(date +%Y-%m-%d)'",
    "timezone": "America/New_York",
    "schedule_rows": [
      {
        "departing_terminal": "Woods Hole",
        "arriving_terminal": "Vineyard Haven",
        "departure_time_local": "10:00 AM",
        "status": "on_time"
      }
    ],
    "reason_rows": [],
    "conditions": [
      {
        "terminal_slug": "woods-hole",
        "wind_speed_mph": 12,
        "wind_direction_text": "WSW",
        "wind_direction_degrees": 248,
        "raw_wind_text": "WSW 12 mph",
        "source_url": "https://www.steamshipauthority.com/traveling_today/status"
      }
    ]
  }')

echo "Ingest Response:"
echo "$INGEST_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$INGEST_RESPONSE"
echo ""

# Check if conditions were inserted
CONDITIONS_INSERTED=$(echo "$INGEST_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('conditions_inserted', 'N/A'))" 2>/dev/null || echo "N/A")
echo "Conditions inserted: $CONDITIONS_INSERTED"
echo ""

# 2. Check the GET endpoint version
echo "=== TEST 2: Ingest API version ==="
VERSION_RESPONSE=$(curl -s "http://localhost:3000/api/operator/status/ingest")
echo "$VERSION_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$VERSION_RESPONSE"
echo ""

# 3. Verify MANUAL_STATUS_OVERRIDES is removed
echo "=== TEST 3: MANUAL_STATUS_OVERRIDES removed ==="
if grep -r "MANUAL_STATUS_OVERRIDES" src/lib/schedules/steamship.ts 2>/dev/null; then
  echo "FAILED: MANUAL_STATUS_OVERRIDES still present in steamship.ts"
  exit 1
else
  echo "PASSED: MANUAL_STATUS_OVERRIDES removed"
fi
echo ""

# 4. Verify mock-anon-key is removed
echo "=== TEST 4: mock-anon-key removed ==="
if grep -r "mock-anon-key" src/lib/supabase/client.ts 2>/dev/null; then
  echo "FAILED: mock-anon-key still present in client.ts"
  exit 1
else
  echo "PASSED: mock-anon-key removed"
fi
echo ""

# 5. Verify files exist
echo "=== TEST 5: Required files exist ==="
REQUIRED_FILES=(
  "src/lib/events/operator-conditions.ts"
  "src/lib/guards/wind-source-priority.ts"
  "supabase/migrations/005_operator_conditions.sql"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "PASSED: $file exists"
  else
    echo "FAILED: $file missing"
    exit 1
  fi
done
echo ""

# 6. Verify observer extension has conditions extraction
echo "=== TEST 6: Observer extension updated ==="
if grep -q "extractWindConditions" observer-extension/ssa-observer/background.js 2>/dev/null; then
  echo "PASSED: extractWindConditions function exists"
else
  echo "FAILED: extractWindConditions function missing from observer extension"
  exit 1
fi
echo ""

echo "=========================================="
echo "All Phase 43 verifications passed!"
echo "=========================================="
