/**
 * Auth Ready API
 *
 * GET /api/auth/ready
 *
 * Returns 200 only when server can confirm authentication via cookies.
 * Used to gate betting UI/API calls until server-side auth is hydrated.
 */

import { NextResponse } from 'next/server';
import { createRouteClient } from '@/lib/supabase/serverRouteClient';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createRouteClient({ allowNull: true });

  if (!supabase) {
    return NextResponse.json({ ready: false }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ready: false }, { status: 401 });
  }

  console.log('[AUTH READY] Server confirmed user:', user.id);
  return NextResponse.json({ ready: true });
}
