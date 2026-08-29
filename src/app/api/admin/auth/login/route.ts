import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearAdminAuthCookies, ensureAdminCsrfCookie, setAdminAuthCookies } from '@/lib/admin-cookie';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid login payload.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseUrl || !supabaseAnonKey || !supabaseAdmin) {
    return NextResponse.json({ error: 'Missing Supabase server configuration.' }, { status: 500 });
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: signInData, error: signInError } = await supabaseUser.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password
  });

  if (signInError || !signInData.user || !signInData.session?.access_token || !signInData.session.refresh_token) {
    const denied = NextResponse.json({ error: signInError?.message ?? 'Login failed.' }, { status: 401 });
    clearAdminAuthCookies(denied);
    return denied;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, display_name')
    .eq('user_id', signInData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin') {
    await supabaseUser.auth.signOut();
    const denied = NextResponse.json({ error: 'Admin role is required.' }, { status: 403 });
    clearAdminAuthCookies(denied);
    return denied;
  }

  const response = NextResponse.json({
    ok: true,
    session: {
      userId: signInData.user.id,
      email: signInData.user.email ?? parsed.data.email,
      role: 'admin' as const,
      displayName: profile.display_name
    }
  });

  setAdminAuthCookies(response, {
    accessToken: signInData.session.access_token,
    refreshToken: signInData.session.refresh_token,
    expiresInSeconds: signInData.session.expires_in
  });
  ensureAdminCsrfCookie(response, request.headers.get('cookie'));

  return response;
}
