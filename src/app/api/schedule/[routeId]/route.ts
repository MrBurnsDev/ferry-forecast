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
 * PHASE 15/80.3 PROVENANCE RULES:
 * - Every response includes provenance metadata
 * - source_type: "operator_status" | "operator_snapshot" | "template" | "unavailable" (Phase 80.3 canonical)
 * - source_name: Operator name
 * - fetched_at: ISO timestamp
 * - source_url: Link to operator schedule
 * - We NEVER return silent static fallback schedules
 *
 * PHASE 17 STATUS INTEGRATION:
 * - Per-sailing status comes from operator status page (when available)
 * - Advisories are passed through verbatim from operator
 * - Precedence: operator_status_page > schedule_page > inferred
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
  // Note: Phase 17 SSA schedule now includes per-sailing status from status page
  const [scheduleResult, operatorStatusResult] = await Promise.all([
    getBidirectionalSchedule(routeId),
    getOperatorStatus(routeId),
  ]);

  const { outbound, combined } = scheduleResult;

  // Phase 17: Sailings may already have per-sailing status from status page
  // Only apply route-level operator status if individual sailings don't have operator status
  const sailingStatus = mapOperatorStatusToSailing(operatorStatusResult.status);

  // Apply route-level operator status to sailings that don't already have operator-confirmed status
  let sailingsWithStatus = combined;
  if (sailingStatus) {
    sailingsWithStatus = applySailingStatus(
      combined,
      sailingStatus,
      operatorStatusResult.message || undefined
    );
  }

  // Use outbound provenance as the primary (they should be the same for both directions)
  const provenance = outbound.provenance;

  // Phase 17: Collect advisories from outbound (already filtered by route)
  const advisories = outbound.advisories || [];

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

      // PHASE 17: Travel advisories from operator (verbatim)
      advisories: advisories.length > 0 ? advisories : undefined,

      // PHASE 17: Status source info
      statusSource: outbound.statusSource,

      // Operator status (from alerts/scraping - may be supplemental to per-sailing)
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
