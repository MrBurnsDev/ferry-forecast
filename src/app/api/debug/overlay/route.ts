/**
 * Debug API: Phase 48 Overlay Status
 *
 * Returns diagnostic info about the Supabase overlay loading.
 * Use this to debug why cancellations might not be appearing.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getTodayInTimezone } from '@/lib/schedules/time';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const operatorId = url.searchParams.get('operator') || 'ssa';
  const dateOverride = url.searchParams.get('date'); // Optional date override for testing

  const timezone = 'America/New_York';
  const todayLocal = dateOverride || getTodayInTimezone(timezone);

  const supabase = createServerClient();

  const diagnostics: Record<string, unknown> = {
    timestamp_utc: new Date().toISOString(),
    service_date_local: todayLocal,
    timezone,
    operator_id: operatorId,
    supabase_configured: !!supabase,
  };

  if (!supabase) {
    return NextResponse.json({
      ...diagnostics,
      error: 'Supabase client not configured',
      sailing_events: [],
    });
  }

  try {
    // Query sailing_events for the operator and date
    const { data, error } = await supabase
      .from('sailing_events')
      .select('*')
      .eq('operator_id', operatorId)
      .eq('service_date', todayLocal)
      .order('observed_at', { ascending: false });

    if (error) {
      return NextResponse.json({
        ...diagnostics,
        error: `Query failed: ${error.message}`,
        sailing_events: [],
      });
    }

    // Also check what dates have data
    const { data: allDates } = await supabase
      .from('sailing_events')
      .select('service_date')
      .eq('operator_id', operatorId)
      .order('service_date', { ascending: false })
      .limit(10);

    const uniqueDates = [...new Set(allDates?.map(d => d.service_date) || [])];

    // Count by status
    const statusCounts = {
      on_time: 0,
      delayed: 0,
      canceled: 0,
    };

    for (const event of data || []) {
      const status = event.status as keyof typeof statusCounts;
      if (status in statusCounts) {
        statusCounts[status]++;
      }
    }

    return NextResponse.json({
      ...diagnostics,
      recent_service_dates: uniqueDates,
      sailing_events_count: data?.length || 0,
      status_counts: statusCounts,
      sailing_events: data?.map(e => ({
        from_port: e.from_port,
        to_port: e.to_port,
        departure_time: e.departure_time,
        status: e.status,
        status_message: e.status_message,
        observed_at: e.observed_at,
      })) || [],
    });
  } catch (err) {
    return NextResponse.json({
      ...diagnostics,
      error: `Exception: ${err instanceof Error ? err.message : String(err)}`,
      sailing_events: [],
    });
  }
}
