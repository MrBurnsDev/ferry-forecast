import { NextRequest, NextResponse } from 'next/server';
import { getBidirectionalSchedule, applySailingStatus } from '@/lib/schedules';
import { getOperatorStatus } from '@/lib/operators';
import type { SailingStatus } from '@/lib/schedules';
import type { OfficialStatus } from '@/types/forecast';

// Cache configuration
const CACHE_MAX_AGE = 180; // 3 minutes

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

  return NextResponse.json(
    {
      routeId,
      scheduleDate: outbound.scheduleDate,
      fetchedAt: outbound.fetchedAt,
      operator: outbound.operator,
      operatorScheduleUrl: outbound.operatorScheduleUrl,
      isStaticFallback: outbound.isStaticFallback,
      sailings: sailingsWithStatus,
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
