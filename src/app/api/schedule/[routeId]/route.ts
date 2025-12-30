import { NextRequest, NextResponse } from 'next/server';
import { getBidirectionalSchedule, applySailingStatus } from '@/lib/schedules';
import { getOperatorStatus } from '@/lib/operators';
import type { SailingStatus } from '@/lib/schedules';
import type { OfficialStatus } from '@/types/forecast';

// Cache configuration
const CACHE_MAX_AGE = 300; // 5 minutes (increased from 3)

interface RouteParams {
  params: Promise<{
    routeId: string;
  }>;
}

/**
 * Map OfficialStatus to SailingStatus
 */
function mapOperatorStatusToSailing(status: OfficialStatus | null): SailingStatus | null {
  if (!status) return null;
  switch (status) {
    case 'on_time':
      return 'on_time';
    case 'delayed':
      return 'delayed';
    case 'canceled':
      return 'canceled';
    default:
      return null;
  }
}

/**
 * GET /api/schedule/:routeId
 *
 * Returns today's sailing schedule for a route (both directions).
 *
 * PHASE 15 PROVENANCE RULES:
 * - Every response includes provenance metadata
 * - source_type: "operator_live" | "template" | "unavailable"
 * - source_name: Operator name
 * - fetched_at: ISO timestamp
 * - source_url: Link to operator schedule
 * - We NEVER return silent static fallback schedules
 *
 * IMPORTANT: This is DISPLAY ONLY data showing scheduled sailings.
 * It does NOT predict or infer cancellations. Individual sailing
 * status comes from operator reports when available.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { routeId } = await params;

  // Fetch schedule and operator status in parallel
  const [scheduleResult, operatorStatusResult] = await Promise.all([
    getBidirectionalSchedule(routeId),
    getOperatorStatus(routeId),
  ]);

  const { outbound, combined } = scheduleResult;

  // Map operator status to sailing status
  const sailingStatus = mapOperatorStatusToSailing(operatorStatusResult.status);

  // Apply operator status to sailings (if we have route-level status)
  const sailingsWithStatus = sailingStatus
    ? applySailingStatus(combined, sailingStatus, operatorStatusResult.message || undefined)
    : combined;

  // Use outbound provenance as the primary (they should be the same for both directions)
  const provenance = outbound.provenance;

  return NextResponse.json(
    {
      routeId,
      scheduleDate: outbound.scheduleDate,
      operator: outbound.operator,
      operatorScheduleUrl: outbound.operatorScheduleUrl,
      sailings: sailingsWithStatus,

      // PHASE 15: Full provenance metadata
      provenance: {
        source_type: provenance.source_type,
        source_name: provenance.source_name,
        fetched_at: provenance.fetched_at,
        source_url: provenance.source_url,
        parse_confidence: provenance.parse_confidence,
        raw_status_supported: provenance.raw_status_supported,
        error_message: provenance.error_message,
      },

      // Operator status (from alerts/scraping)
      operatorStatus: {
        status: operatorStatusResult.status,
        source: operatorStatusResult.source,
        message: operatorStatusResult.message,
        updatedAt: operatorStatusResult.updated_at,
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=60`,
      },
    }
  );
}
