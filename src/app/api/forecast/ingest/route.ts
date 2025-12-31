/**
 * Forecast Ingest API
 *
 * Phase 32: Forecast Modeling
 *
 * POST /api/forecast/ingest
 *
 * Cron-friendly endpoint for ingesting weather forecasts from Open-Meteo.
 * Designed to be called by Vercel Cron or external scheduler.
 *
 * Features:
 * - Ingests both GFS (7-day) and ECMWF (14-day) forecasts
 * - Persists to Supabase for historical analysis
 * - Returns summary of ingested data
 *
 * Security:
 * - Requires CRON_SECRET for production
 * - Public in development for testing
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestAllForecasts } from '@/lib/weather/open-meteo';

// Use Node.js runtime for reliable Supabase writes
export const runtime = 'nodejs';

// Max duration for Vercel serverless (Pro plan allows 60s, Hobby allows 10s)
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
 * POST /api/forecast/ingest
 *
 * Trigger forecast ingestion
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

      // Also check for Vercel Cron secret header
      const vercelCronAuth = request.headers.get('x-vercel-cron-auth');

      if (!cronSecret) {
        console.error('[FORECAST_INGEST] CRON_SECRET not configured');
        return jsonResponse(
          { success: false, error: 'server_misconfiguration' },
          500
        );
      }

      if (token !== cronSecret && vercelCronAuth !== cronSecret) {
        console.warn('[FORECAST_INGEST] Invalid authorization');
        return jsonResponse(
          { success: false, error: 'unauthorized' },
          401
        );
      }
    }

    console.log('[FORECAST_INGEST] Starting forecast ingestion...');

    // Ingest all forecasts
    const results = await ingestAllForecasts();

    const duration = Date.now() - startTime;
    console.log(`[FORECAST_INGEST] Completed in ${duration}ms`);

    return jsonResponse({
      success: true,
      ingested: {
        gfs: results.gfs,
        ecmwf: results.ecmwf,
      },
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[FORECAST_INGEST] Error:', error);
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
 * GET /api/forecast/ingest - Health check and status
 */
export async function GET(): Promise<NextResponse> {
  return jsonResponse({
    success: true,
    endpoint: '/api/forecast/ingest',
    method: 'POST',
    description: 'Ingest weather forecasts from Open-Meteo',
    auth: 'Bearer CRON_SECRET or x-vercel-cron-auth header',
    models: ['gfs (7-day)', 'ecmwf (14-day)'],
    status: 'ready',
  });
}
