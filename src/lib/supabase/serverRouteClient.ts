/**
 * Server-Side Route Handler Supabase Client
 *
 * Phase 85: Supabase client for API route handlers with auth support.
 * Uses @supabase/ssr for Next.js App Router compatibility.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Ferry Forecast uses an isolated schema
const SCHEMA_NAME = 'ferry_forecast';

/**
 * Creates a Supabase client for route handlers with cookie-based auth.
 * Use this in API routes to access user sessions.
 *
 * @param options.allowNull - If true, returns null instead of throwing when credentials missing
 */
export function createRouteClient(options?: { allowNull?: boolean }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (options?.allowNull) return null;
    throw new Error('Supabase credentials not configured');
  }

  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    db: {
      schema: SCHEMA_NAME,
    },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Cookie setting fails in middleware/edge functions
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Cookie removal fails in middleware/edge functions
        }
      },
    },
  });
}
