/**
 * Server-Side Bearer Token Supabase Client
 *
 * Phase 86E: Supabase client for API route handlers with Bearer token auth.
 * Use this instead of serverRouteClient when cookies cannot be reliably read
 * (e.g., cross-domain scenarios or shared Supabase projects).
 *
 * Client sends: Authorization: Bearer <access_token>
 * Server validates: supabase.auth.getUser(token)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

// Ferry Forecast uses an isolated schema
const SCHEMA_NAME = 'ferry_forecast';

// Use a generic SupabaseClient type to avoid schema type conflicts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface BearerAuthResult {
  supabase: AnySupabaseClient | null;
  user: { id: string } | null;
  error: string | null;
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

/**
 * Creates a Supabase client and validates the Bearer token from the request.
 *
 * Usage:
 * ```
 * const { supabase, user, error } = await createBearerClient(request);
 * if (error || !user) {
 *   return NextResponse.json({ success: false, error: error || 'Not authenticated' }, { status: 401 });
 * }
 * // Use supabase client for DB operations
 * ```
 */
export async function createBearerClient(request: NextRequest): Promise<BearerAuthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { supabase: null, user: null, error: 'Service not configured' };
  }

  // Extract Bearer token
  const token = extractBearerToken(request);
  if (!token) {
    console.log('[BEARER AUTH] No Bearer token in Authorization header');
    return { supabase: null, user: null, error: 'No authorization token provided' };
  }

  // Create Supabase client with anon key (NOT service role)
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db: {
      schema: SCHEMA_NAME,
    },
  });

  // Validate the token by calling getUser with the token
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError) {
    console.log('[BEARER AUTH] Token validation failed:', authError.message);
    return { supabase, user: null, error: 'Invalid or expired token' };
  }

  if (!user) {
    console.log('[BEARER AUTH] No user returned from token validation');
    return { supabase, user: null, error: 'Not authenticated' };
  }

  console.log('[BEARER AUTH] Token validated, user:', user.id);
  return { supabase, user: { id: user.id }, error: null };
}
