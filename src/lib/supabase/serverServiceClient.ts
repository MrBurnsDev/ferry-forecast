/**
 * Server-Side Supabase Service Role Client
 *
 * Phase 35: Forecast API Auth Hardening + Regression Guard
 *
 * IMPORTANT: This client bypasses RLS using the service role key.
 * Use ONLY in server-side API routes (not browser-side).
 *
 * WHY SERVICE ROLE?
 * - prediction_snapshots_v2 has RLS policies that restrict anon access
 * - Forecast data is read-only and safe to expose via API
 * - Service role bypasses RLS, allowing the API to read predictions
 *
 * SECURITY:
 * - Never import this file in client-side code
 * - Never expose SUPABASE_SERVICE_ROLE_KEY to the browser
 * - This file only works in Node.js runtime (not Edge)
 */

import { createClient } from '@supabase/supabase-js';

// Ferry Forecast uses an isolated schema for multi-app Supabase projects
const SCHEMA_NAME = 'ferry_forecast';

/**
 * Creates a Supabase client with service role (RLS bypass) for server-side use.
 *
 * @returns SupabaseClient configured with service role, or null if credentials missing
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY is explicitly required but missing
 */
export function createServiceRoleClient(options?: {
  /** If true, returns null instead of throwing on missing credentials */
  allowNull?: boolean;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Validate required environment variables
  if (!supabaseUrl) {
    console.error('[SERVICE_CLIENT] NEXT_PUBLIC_SUPABASE_URL is not configured');
    if (options?.allowNull) return null;
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for service role client');
  }

  if (!serviceRoleKey) {
    // REGRESSION GUARD: Missing service role key is a deployment misconfiguration
    // This should NEVER happen in production - it means the forecast feature is broken
    console.error(
      '[SERVICE_CLIENT] SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
        'Forecast API will not work without it. ' +
        'Check Vercel environment variables.'
    );

    if (options?.allowNull) return null;
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for forecast data access. ' +
        'This is a deployment configuration error.'
    );
  }

  // SECURITY CHECK: Ensure we're not accidentally using anon key
  // Service role keys typically start with "eyJ" (JWT) and are longer
  if (serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error(
      '[SERVICE_CLIENT] SUPABASE_SERVICE_ROLE_KEY appears to be the same as anon key. ' +
        'This is a misconfiguration - service role key should be different.'
    );
    if (options?.allowNull) return null;
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must not equal NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: SCHEMA_NAME,
    },
  });
}

/**
 * Check if service role credentials are properly configured
 */
export function isServiceRoleConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
