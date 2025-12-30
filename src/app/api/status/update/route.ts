/**
 * Manual Status Update API
 *
 * Phase 22: Single-Corridor Truth Lock
 *
 * POST /api/status/update
 *
 * Allows manual submission of SSA status data when automated scraping
 * is blocked by Queue-IT. This endpoint accepts sailing status from
 * a trusted source (browser extension, bookmarklet, or manual entry).
 *
 * SECURITY: Protected by API key in environment variable STATUS_UPDATE_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedStatus,
  setCachedStatus,
  portNameToSlug,
  normalizeStatus,
  type CachedSailingStatus,
} from '@/lib/schedules/status-cache';

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
  });
}

/**
 * POST /api/status/update - Submit new status data
 *
 * Body format:
 * {
 *   "key": "your-api-key",
 *   "sailings": [
 *     {
 *       "from": "Woods Hole",
 *       "to": "Vineyard Haven",
 *       "departureTime": "8:35 AM",
 *       "status": "canceled",
 *       "statusMessage": "Cancelled due to Weather conditions"
 *     },
 *     ...
 *   ]
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.STATUS_UPDATE_KEY;

  // If no key configured, allow unauthenticated updates in development
  const isDev = process.env.NODE_ENV === 'development';

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

    // Validate sailings array
    if (!Array.isArray(body.sailings)) {
      return NextResponse.json(
        { success: false, error: 'sailings must be an array' },
        { status: 400 }
      );
    }

    // Process sailings
    const sailings: CachedSailingStatus[] = body.sailings.map((s: Record<string, unknown>) => ({
      from: String(s.from || ''),
      fromSlug: portNameToSlug(String(s.from || '')),
      to: String(s.to || ''),
      toSlug: portNameToSlug(String(s.to || '')),
      departureTime: normalizeTime(String(s.departureTime || '')),
      status: normalizeStatus(String(s.status || '')),
      statusMessage: s.statusMessage ? String(s.statusMessage) : undefined,
    }));

    // Update cache
    setCachedStatus(sailings);

    console.log(`[STATUS_UPDATE] Received ${sailings.length} sailing statuses`);

    const cache = getCachedStatus();

    return NextResponse.json({
      success: true,
      message: `Updated ${sailings.length} sailing statuses`,
      expiresAt: cache ? new Date(cache.expiresAt).toISOString() : null,
    });
  } catch (error) {
    console.error('[STATUS_UPDATE] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }
}

/**
 * Normalize time format
 */
function normalizeTime(time: string): string {
  return time.trim().replace(/\s+/g, ' ').replace(/am$/i, 'AM').replace(/pm$/i, 'PM');
}
