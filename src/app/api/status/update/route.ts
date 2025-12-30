/**
 * Manual Status Update API
 *
 * Phase 22: Single-Corridor Truth Lock
 * Phase 24: SSA Observer Extension support
 *
 * POST /api/status/update
 *
 * Allows manual submission of SSA status data when automated scraping
 * is blocked by Queue-IT. This endpoint accepts sailing status from
 * a trusted source (browser extension, bookmarklet, or manual entry).
 *
 * Supports two payload formats:
 * 1. Legacy format: { key, sailings: [...] }
 * 2. Extension format: { key, source, boards: [...], ... }
 *
 * SECURITY: Protected by API key in environment variable STATUS_UPDATE_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedStatus,
  setCachedStatus,
  setExtendedCachedStatus,
  portNameToSlug,
  normalizeStatus,
  type CachedSailingStatus,
} from '@/lib/schedules/status-cache';

// Extension payload types
interface ExtensionRow {
  depart_port_name: string;
  arrive_port_name: string;
  depart_time_local: string;
  arrive_time_local: string;
  status_text_raw: string;
  status_normalized: string;
}

interface ExtensionBoard {
  board_id: string;
  rows: ExtensionRow[];
}

interface ExtensionPayload {
  key: string;
  source: string;
  observed_at_utc: string;
  operator_id: string;
  service_date_local: string;
  timezone: string;
  boards: ExtensionBoard[];
  page_meta?: {
    url: string;
    hash: string;
    user_agent: string;
    parse_version: string;
  };
}

interface LegacyPayload {
  key: string;
  sailings: Array<{
    from: string;
    to: string;
    departureTime: string;
    status: string;
    statusMessage?: string;
  }>;
}

/**
 * GET /api/status/update - Get current cached status
 */
export async function GET(): Promise<NextResponse> {
  const cache = getCachedStatus();

  if (!cache) {
    return NextResponse.json({
      success: true,
      cached: false,
      sailings: [],
      message: 'No cached status data',
    });
  }

  return NextResponse.json({
    success: true,
    cached: true,
    sailings: cache.sailings,
    updatedAt: cache.updatedAt,
    expiresAt: new Date(cache.expiresAt).toISOString(),
    source: cache.source,
    observedAt: cache.observedAt,
  });
}

/**
 * POST /api/status/update - Submit new status data
 *
 * Legacy format:
 * {
 *   "key": "your-api-key",
 *   "sailings": [
 *     {
 *       "from": "Woods Hole",
 *       "to": "Vineyard Haven",
 *       "departureTime": "8:35 AM",
 *       "status": "canceled",
 *       "statusMessage": "Cancelled due to Weather conditions"
 *     }
 *   ]
 * }
 *
 * Extension format (Phase 24):
 * {
 *   "key": "your-api-key",
 *   "source": "ssa_observer_extension",
 *   "observed_at_utc": "2025-12-30T14:12:00Z",
 *   "operator_id": "ssa",
 *   "service_date_local": "2025-12-30",
 *   "timezone": "America/New_York",
 *   "boards": [
 *     {
 *       "board_id": "vineyard_trips",
 *       "rows": [
 *         {
 *           "depart_port_name": "Woods Hole",
 *           "arrive_port_name": "Vineyard Haven",
 *           "depart_time_local": "8:35 AM",
 *           "arrive_time_local": "9:20 AM",
 *           "status_text_raw": "Cancelled due to Weather conditions",
 *           "status_normalized": "canceled"
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.STATUS_UPDATE_KEY;
  const isDev = process.env.NODE_ENV === 'development';
  const debug = process.env.SCHEDULE_DEBUG === 'true';

  try {
    const body = await request.json();

    // Validate API key (skip in development if no key set)
    if (apiKey && body.key !== apiKey) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key' },
        { status: 401 }
      );
    }

    if (!isDev && !apiKey) {
      return NextResponse.json(
        { success: false, error: 'STATUS_UPDATE_KEY not configured' },
        { status: 500 }
      );
    }

    // Detect payload format
    if (body.boards && Array.isArray(body.boards)) {
      // Extension format (Phase 24)
      return handleExtensionPayload(body as ExtensionPayload, debug);
    } else if (body.sailings && Array.isArray(body.sailings)) {
      // Legacy format
      return handleLegacyPayload(body as LegacyPayload, debug);
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid payload: must include "sailings" or "boards" array' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[STATUS_UPDATE] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }
}

/**
 * Handle extension payload format (Phase 24)
 */
function handleExtensionPayload(payload: ExtensionPayload, debug: boolean): NextResponse {
  const sailings: CachedSailingStatus[] = [];

  for (const board of payload.boards) {
    for (const row of board.rows) {
      sailings.push({
        from: row.depart_port_name,
        fromSlug: portNameToSlug(row.depart_port_name),
        to: row.arrive_port_name,
        toSlug: portNameToSlug(row.arrive_port_name),
        departureTime: normalizeTime(row.depart_time_local),
        status: normalizeStatus(row.status_normalized || row.status_text_raw),
        statusMessage: row.status_text_raw,
        boardId: board.board_id,
      });
    }
  }

  // Store with extended metadata
  setExtendedCachedStatus(sailings, {
    source: payload.source,
    observedAt: payload.observed_at_utc,
    operatorId: payload.operator_id,
    serviceDateLocal: payload.service_date_local,
    timezone: payload.timezone,
    pageHash: payload.page_meta?.hash,
  });

  if (debug) {
    console.log(`[STATUS_UPDATE] Extension payload from ${payload.source}`);
    console.log(`[STATUS_UPDATE] Observed at: ${payload.observed_at_utc}`);
    console.log(`[STATUS_UPDATE] Boards: ${payload.boards.map(b => `${b.board_id}(${b.rows.length})`).join(', ')}`);
  }

  console.log(`[STATUS_UPDATE] Received ${sailings.length} sailing statuses from ${payload.source}`);

  const cache = getCachedStatus();

  return NextResponse.json({
    success: true,
    message: `Updated ${sailings.length} sailing statuses`,
    source: payload.source,
    observedAt: payload.observed_at_utc,
    boardsProcessed: payload.boards.map(b => b.board_id),
    expiresAt: cache ? new Date(cache.expiresAt).toISOString() : null,
  });
}

/**
 * Handle legacy payload format
 */
function handleLegacyPayload(payload: LegacyPayload, debug: boolean): NextResponse {
  const sailings: CachedSailingStatus[] = payload.sailings.map((s) => ({
    from: String(s.from || ''),
    fromSlug: portNameToSlug(String(s.from || '')),
    to: String(s.to || ''),
    toSlug: portNameToSlug(String(s.to || '')),
    departureTime: normalizeTime(String(s.departureTime || '')),
    status: normalizeStatus(String(s.status || '')),
    statusMessage: s.statusMessage ? String(s.statusMessage) : undefined,
  }));

  setCachedStatus(sailings);

  if (debug) {
    console.log(`[STATUS_UPDATE] Legacy payload with ${sailings.length} sailings`);
  }

  console.log(`[STATUS_UPDATE] Received ${sailings.length} sailing statuses`);

  const cache = getCachedStatus();

  return NextResponse.json({
    success: true,
    message: `Updated ${sailings.length} sailing statuses`,
    expiresAt: cache ? new Date(cache.expiresAt).toISOString() : null,
  });
}

/**
 * Normalize time format
 */
function normalizeTime(time: string): string {
  return time.trim().replace(/\s+/g, ' ').replace(/am$/i, 'AM').replace(/pm$/i, 'PM');
}
