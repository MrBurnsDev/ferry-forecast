/**
 * Operator Status Ingest API
 *
 * Phase 24: Trusted Operator Observer
 * Phase 25: Fix JSON Response Contract
 * Phase 27: Persistent Sailing Event Memory
 * Phase 31: Fix persistence - switch to Node.js runtime and awaited persistence
 * Phase 37: Live Operator Status Reconciliation
 *
 * POST /api/operator/status/ingest
 *
 * Receives operator status data from trusted browser-based observer.
 * This is Layer 1 (Operator Truth) data that overlays template schedules.
 *
 * Rules:
 * - NEVER creates new sailings from scratch
 * - NEVER deletes sailings
 * - ONLY updates matching sailings by terminal pair + service date + departure time
 *
 * Phase 37 Addition:
 * - Reconciliation: UPSERT on natural key instead of always INSERT
 * - Track status changes with previous_status audit trail
 * - Log status changes: [RECONCILE] Status changed: on_time → canceled
 *
 * KEY PRINCIPLE: Operator reality overrides prediction.
 * Forecast explains risk. Operator status defines truth.
 *
 * Security:
 * - Requires Bearer token authentication via OBSERVER_SECRET env var
 * - Rate limited
 * - All ingests are logged with trigger source
 *
 * Response Contract:
 * - ALL exit paths return valid JSON with { success: boolean, ... }
 * - No empty bodies, no redirects, no HTML error pages
 */

import { NextRequest, NextResponse } from 'next/server';

// Phase 31: Force Node.js runtime for reliable Supabase writes
export const runtime = 'nodejs';
import {
  persistSailingEvents,
  getCorridorId,
  mapOperatorId,
  normalizePortSlug,
  type SailingEventInput,
} from '@/lib/events/sailing-events';

// Rate limiting: track last ingest time per source
const lastIngestTime: Record<string, number> = {};
const RATE_LIMIT_MS = 60 * 1000; // 1 minute minimum between ingests

// Payload types
interface IngestSailing {
  departing_terminal: string;
  arriving_terminal: string;
  departure_time_local: string;
  arrival_time_local?: string;
  status: 'on_time' | 'canceled' | 'delayed';
  status_message?: string;
}

interface IngestAdvisory {
  message: string;
}

interface IngestPayload {
  source: string;
  trigger: 'auto' | 'manual';
  scraped_at_utc: string;
  service_date_local: string;
  timezone: string;
  advisories?: IngestAdvisory[];
  sailings: IngestSailing[];
}

/**
 * Helper to create a consistent JSON response
 */
function jsonResponse(
  body: Record<string, unknown>,
  status: number = 200
): NextResponse {
  console.log(`[INGEST] Response: ${status} success=${body.success} ${body.error || ''}`);
  return NextResponse.json(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * POST /api/operator/status/ingest
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Outer try-catch to guarantee JSON response even on unexpected errors
  try {
    const observerSecret = process.env.OBSERVER_SECRET;
    const isDev = process.env.NODE_ENV === 'development';

    // Extract Bearer token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Validate authentication
    if (!isDev) {
      if (!observerSecret) {
        console.error('[INGEST] OBSERVER_SECRET not configured');
        return jsonResponse(
          { success: false, error: 'server_misconfiguration' },
          500
        );
      }

      if (!token || token !== observerSecret) {
        console.warn('[INGEST] Invalid or missing authorization');
        return jsonResponse(
          { success: false, error: 'unauthorized' },
          401
        );
      }
    }

    // Parse request body
    let payload: IngestPayload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(
        { success: false, error: 'invalid_json' },
        400
      );
    }

    // Validate required fields
    if (!payload.source || !payload.trigger || !payload.sailings) {
      return jsonResponse(
        { success: false, error: 'missing_required_fields' },
        400
      );
    }

    // Rate limiting (skip in dev for testing)
    if (!isDev) {
      const now = Date.now();
      const lastTime = lastIngestTime[payload.source] || 0;
      if (now - lastTime < RATE_LIMIT_MS) {
        const waitSeconds = Math.ceil((RATE_LIMIT_MS - (now - lastTime)) / 1000);
        console.warn(`[INGEST] Rate limited: ${payload.source}, wait ${waitSeconds}s`);
        return jsonResponse(
          { success: false, error: 'rate_limited', wait_seconds: waitSeconds },
          429
        );
      }
      lastIngestTime[payload.source] = now;
    }

    // Import status-cache dynamically to isolate any import errors
    let setExtendedCachedStatus: typeof import('@/lib/schedules/status-cache').setExtendedCachedStatus;
    let portNameToSlug: typeof import('@/lib/schedules/status-cache').portNameToSlug;
    let normalizeStatus: typeof import('@/lib/schedules/status-cache').normalizeStatus;

    try {
      const statusCache = await import('@/lib/schedules/status-cache');
      setExtendedCachedStatus = statusCache.setExtendedCachedStatus;
      portNameToSlug = statusCache.portNameToSlug;
      normalizeStatus = statusCache.normalizeStatus;
    } catch (importError) {
      console.error('[INGEST] Failed to import status-cache:', importError);
      return jsonResponse(
        { success: false, error: 'internal_error' },
        500
      );
    }

    // Transform sailings to cache format
    const sailings = payload.sailings.map((s) => ({
      from: s.departing_terminal,
      fromSlug: portNameToSlug(s.departing_terminal),
      to: s.arriving_terminal,
      toSlug: portNameToSlug(s.arriving_terminal),
      departureTime: normalizeTime(s.departure_time_local),
      status: normalizeStatus(s.status),
      statusMessage: s.status_message,
    }));

    // Store with extended metadata
    try {
      setExtendedCachedStatus(sailings, {
        source: `${payload.source}_observer`,
        observedAt: payload.scraped_at_utc,
        operatorId: payload.source,
        serviceDateLocal: payload.service_date_local,
        timezone: payload.timezone,
      });
    } catch (cacheError) {
      console.error('[INGEST] Failed to update cache:', cacheError);
      return jsonResponse(
        { success: false, error: 'cache_update_failed' },
        500
      );
    }

    // Log ingest with runtime info
    console.log(
      `[INGEST] runtime=${process.env.NEXT_RUNTIME ?? 'nodejs'} ` +
      `${payload.trigger.toUpperCase()} from ${payload.source}: ` +
      `${sailings.length} sailings, ${payload.advisories?.length || 0} advisories`
    );

    // Phase 27: Persist sailing events to database
    // Phase 31: Switch from fire-and-forget to awaited persistence
    // Reason: Vercel serverless functions terminate immediately after response,
    // so fire-and-forget async work never completes. We must await to ensure
    // the DB write finishes before the function exits.
    const operatorId = mapOperatorId(payload.source);
    const eventInputs: SailingEventInput[] = payload.sailings.map((s) => {
      const fromSlug = normalizePortSlug(s.departing_terminal);
      const toSlug = normalizePortSlug(s.arriving_terminal);
      return {
        operator_id: operatorId,
        corridor_id: getCorridorId(s.departing_terminal, s.arriving_terminal),
        from_port: fromSlug,
        to_port: toSlug,
        service_date: payload.service_date_local,
        departure_time: normalizeTime(s.departure_time_local),
        status: s.status,
        status_message: s.status_message,
        source: `${payload.source}_observer`,
        observed_at: payload.scraped_at_utc,
      };
    });

    // Phase 31: Await persistence and add comprehensive call-site logging
    console.log(`[INGEST] ENTERING persistSailingEvents call with ${eventInputs.length} events`);
    let persistedCount = 0;
    try {
      persistedCount = await persistSailingEvents(eventInputs);
      console.log(`[INGEST] EXITED persistSailingEvents: ${persistedCount}/${eventInputs.length} persisted`);
    } catch (err) {
      console.error('[INGEST] persistSailingEvents threw exception:', err);
    }

    // Count statuses for response
    const statusCounts = {
      on_time: sailings.filter((s) => s.status === 'on_time').length,
      canceled: sailings.filter((s) => s.status === 'canceled').length,
      delayed: sailings.filter((s) => s.status === 'delayed').length,
    };

    return jsonResponse({
      success: true,
      ingested: sailings.length,
      persisted: persistedCount,
      source: payload.source,
      trigger: payload.trigger,
      scraped_at: payload.scraped_at_utc,
      service_date: payload.service_date_local,
      status_counts: statusCounts,
      advisories_count: payload.advisories?.length || 0,
    });
  } catch (error) {
    // Catch-all for any unexpected errors
    console.error('[INGEST] Unexpected error:', error);
    return jsonResponse(
      { success: false, error: 'unexpected_error' },
      500
    );
  }
}

/**
 * GET /api/operator/status/ingest - Health check
 */
export async function GET(): Promise<NextResponse> {
  return jsonResponse({
    success: true,
    endpoint: '/api/operator/status/ingest',
    method: 'POST',
    auth: 'Bearer OBSERVER_SECRET',
    status: 'ready',
  });
}

/**
 * Normalize time format
 */
function normalizeTime(time: string): string {
  return time.trim().replace(/\s+/g, ' ').replace(/am$/i, 'AM').replace(/pm$/i, 'PM');
}
