import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Ferry Forecast uses an isolated schema for multi-app Supabase projects
const SCHEMA_NAME = 'ferry_forecast' as const;

// Singleton instance for browser
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: SupabaseClient<any, typeof SCHEMA_NAME> | null = null;

/**
 * Get the Supabase client for browser usage
 * Uses singleton pattern to avoid creating multiple GoTrue instances
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBrowserClient(): SupabaseClient<any, typeof SCHEMA_NAME> | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[SUPABASE] Browser client not configured');
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      db: {
        schema: SCHEMA_NAME,
      },
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return browserClient;
}

/**
 * Get the Supabase client for server usage (non-authenticated)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getServerClient(): SupabaseClient<any, typeof SCHEMA_NAME> | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[SUPABASE] Server client not configured');
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    db: {
      schema: SCHEMA_NAME,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Export the appropriate client based on environment
// The client may be null if credentials aren't configured, but we assert non-null
// for backwards compatibility - callers should check isSupabaseConfigured() first
const clientInstance = typeof window !== 'undefined' ? getBrowserClient() : getServerClient();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any, typeof SCHEMA_NAME> = clientInstance as SupabaseClient<any, typeof SCHEMA_NAME>;

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
