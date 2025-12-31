/**
 * Backtest API
 *
 * Phase 32: Forecast Modeling
 *
 * POST /api/learning/backtest - Run backtesting loop
 * GET /api/learning/backtest - Get accuracy metrics
 *
 * Links predictions to outcomes and computes accuracy metrics.
 * Designed to be called by Vercel Cron or manually.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runBacktest,
  getAccuracyMetrics,
  getRecentOutcomes,
} from '@/lib/learning/backtest';

// Use Node.js runtime for reliable Supabase operations
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Helper to create a consistent JSON response
 */
function jsonResponse(
  body: Record<string, unknown>,
  status: number = 200
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * POST /api/learning/backtest
 *
 * Run backtesting loop to link predictions with outcomes
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Authenticate in production
    const isDev = process.env.NODE_ENV === 'development';
    const cronSecret = process.env.CRON_SECRET;

    if (!isDev) {
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const vercelCronAuth = request.headers.get('x-vercel-cron-auth');

      if (!cronSecret) {
        return jsonResponse(
          { success: false, error: 'server_misconfiguration' },
          500
        );
      }

      if (token !== cronSecret && vercelCronAuth !== cronSecret) {
        return jsonResponse(
          { success: false, error: 'unauthorized' },
          401
        );
      }
    }

    // Parse limit from request body
    let limit = 100;
    try {
      const body = await request.json();
      if (typeof body.limit === 'number' && body.limit > 0) {
        limit = Math.min(body.limit, 1000); // Cap at 1000
      }
    } catch {
      // Use default limit
    }

    console.log(`[BACKTEST] Running backtest with limit ${limit}...`);

    const result = await runBacktest(limit);

    const duration = Date.now() - startTime;
    console.log(`[BACKTEST] Completed in ${duration}ms`);

    return jsonResponse({
      success: true,
      result,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[BACKTEST] Error:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'unknown_error',
      },
      500
    );
  }
}

/**
 * GET /api/learning/backtest
 *
 * Get accuracy metrics and recent outcomes
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const modelVersion = searchParams.get('model_version') || undefined;
    const corridorId = searchParams.get('corridor_id') || undefined;

    // Get accuracy metrics
    const metrics = await getAccuracyMetrics(modelVersion, corridorId);

    // Get recent outcomes
    const recentOutcomes = await getRecentOutcomes(20);

    return jsonResponse({
      success: true,
      metrics,
      recent_outcomes: recentOutcomes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[BACKTEST] Error getting metrics:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'unknown_error',
      },
      500
    );
  }
}
