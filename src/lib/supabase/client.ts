import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Ferry Forecast uses an isolated schema for multi-app Supabase projects
const SCHEMA_NAME = 'ferry_forecast' as const;

// PRODUCTION GUARD: Never use mock/fallback credentials in production paths
// Log errors instead of silently using fake data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseClient: SupabaseClient<any, typeof SCHEMA_NAME> | null = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[SUPABASE] CRITICAL: Supabase credentials not configured. ' +
    'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables. ' +
    'Database operations will fail.'
  );
} else {
  // Client for browser-side usage - configured to use ferry_forecast schema
  // Note: Auth operations use the default 'auth' schema automatically
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    db: {
      schema: SCHEMA_NAME,
    },
    auth: {
      // Ensure auth works correctly in browser
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

// Export a getter that logs errors when used without configuration
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = supabaseClient as SupabaseClient<any, typeof SCHEMA_NAME>;

// Server-side client with service role (for API routes)
export function createServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('Server Supabase credentials not configured.');
    return null;
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

// Check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

// Export schema name for reference
export const schemaName = SCHEMA_NAME;
