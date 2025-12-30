/**
 * Regression Tests for Timezone-Aware Time Parsing
 *
 * Run with: npx tsx src/lib/schedules/time.test.ts
 *
 * These tests verify the Phase 15 fixes for:
 * - Timezone-aware time parsing
 * - DST handling
 * - Departed/Upcoming status computation
 */

import {
  parseTimeInTimezone,
  parseTimeString,
  hasSailingDeparted,
  getSailingTimeStatus,
  getTodayInTimezone,
  DEFAULT_TIMEZONE,
  DEPARTURE_GRACE_MINUTES,
} from './time';

// Test utilities
let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void): void {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (typeof actual !== 'number' || actual >= expected) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toMatch(pattern: RegExp) {
      if (typeof actual !== 'string' || !pattern.test(actual)) {
        throw new Error(`Expected ${actual} to match ${pattern}`);
      }
    },
  };
}

// ============================================================
// TEST SUITE
// ============================================================

console.log('\n=== Time Parsing Tests ===\n');

test('parseTimeString: 12-hour AM format', () => {
  const result = parseTimeString('6:30 AM');
  expect(result.hour24).toBe(6);
  expect(result.minute).toBe(30);
});

test('parseTimeString: 12-hour PM format', () => {
  const result = parseTimeString('2:45 PM');
  expect(result.hour24).toBe(14);
  expect(result.minute).toBe(45);
});

test('parseTimeString: 12 noon', () => {
  const result = parseTimeString('12:00 PM');
  expect(result.hour24).toBe(12);
  expect(result.minute).toBe(0);
});

test('parseTimeString: 12 midnight', () => {
  const result = parseTimeString('12:00 AM');
  expect(result.hour24).toBe(0);
  expect(result.minute).toBe(0);
});

test('parseTimeString: no space before AM/PM', () => {
  const result = parseTimeString('9:30AM');
  expect(result.hour24).toBe(9);
  expect(result.minute).toBe(30);
});

test('parseTimeString: 24-hour format', () => {
  const result = parseTimeString('18:30');
  expect(result.hour24).toBe(18);
  expect(result.minute).toBe(30);
});

console.log('\n=== Timezone Parsing Tests ===\n');

test('parseTimeInTimezone: returns UTC ISO string', () => {
  const result = parseTimeInTimezone('6:00 AM', '2024-12-30', 'America/New_York');
  expect(result.utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
});

test('parseTimeInTimezone: preserves local hour', () => {
  const result = parseTimeInTimezone('9:30 AM', '2024-12-30', 'America/New_York');
  expect(result.localHour).toBe(9);
  expect(result.localMinute).toBe(30);
});

test('parseTimeInTimezone: timestamp is valid', () => {
  const result = parseTimeInTimezone('6:00 AM', '2024-12-30', 'America/New_York');
  expect(result.timestampMs).toBeGreaterThan(0);
});

test('parseTimeInTimezone: 6 AM EST is 11 AM UTC in winter', () => {
  // On Dec 30, EST is UTC-5
  const result = parseTimeInTimezone('6:00 AM', '2024-12-30', 'America/New_York');
  const date = new Date(result.utc);
  expect(date.getUTCHours()).toBe(11); // 6 AM + 5 hours = 11 AM UTC
});

test('parseTimeInTimezone: preserves service date', () => {
  const result = parseTimeInTimezone('11:00 PM', '2024-12-30', 'America/New_York');
  expect(result.serviceDateLocal).toBe('2024-12-30');
});

console.log('\n=== Departure Status Tests ===\n');

test('hasSailingDeparted: future sailing is not departed', () => {
  const futureMs = Date.now() + 60 * 60 * 1000; // 1 hour from now
  expect(hasSailingDeparted(futureMs)).toBe(false);
});

test('hasSailingDeparted: past sailing is departed', () => {
  const pastMs = Date.now() - 60 * 60 * 1000; // 1 hour ago
  expect(hasSailingDeparted(pastMs)).toBe(true);
});

test('hasSailingDeparted: within grace period is not departed', () => {
  const justDepartedMs = Date.now() - 2 * 60 * 1000; // 2 minutes ago
  expect(hasSailingDeparted(justDepartedMs)).toBe(false); // Still within 5 min grace
});

test('hasSailingDeparted: after grace period is departed', () => {
  const departedMs = Date.now() - 10 * 60 * 1000; // 10 minutes ago
  expect(hasSailingDeparted(departedMs)).toBe(true);
});

test('getSailingTimeStatus: future is upcoming', () => {
  const futureMs = Date.now() + 30 * 60 * 1000; // 30 minutes from now
  expect(getSailingTimeStatus(futureMs)).toBe('upcoming');
});

test('getSailingTimeStatus: within grace is boarding', () => {
  const justNowMs = Date.now() - 2 * 60 * 1000; // 2 minutes ago
  expect(getSailingTimeStatus(justNowMs)).toBe('boarding');
});

test('getSailingTimeStatus: past grace is departed', () => {
  const pastMs = Date.now() - 10 * 60 * 1000; // 10 minutes ago
  expect(getSailingTimeStatus(pastMs)).toBe('departed');
});

console.log('\n=== getTodayInTimezone Tests ===\n');

test('getTodayInTimezone: returns YYYY-MM-DD format', () => {
  const today = getTodayInTimezone('America/New_York');
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('DEFAULT_TIMEZONE is America/New_York', () => {
  expect(DEFAULT_TIMEZONE).toBe('America/New_York');
});

test('DEPARTURE_GRACE_MINUTES is 5', () => {
  expect(DEPARTURE_GRACE_MINUTES).toBe(5);
});

// ============================================================
// SUMMARY
// ============================================================

console.log('\n=== Test Summary ===\n');
console.log(`Total: ${testCount}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failCount > 0) {
  process.exit(1);
}
