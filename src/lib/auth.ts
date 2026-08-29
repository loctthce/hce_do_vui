import { ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, readCookieFromHeader } from '@/lib/admin-cookie';
import { getSupabaseAdminClient, getSupabaseUserClient } from '@/lib/supabase';

async function resolveUserFromCookieSession(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  const accessToken = readCookieFromHeader(cookieHeader, ADMIN_ACCESS_COOKIE);
  const refreshToken = readCookieFromHeader(cookieHeader, ADMIN_REFRESH_COOKIE);

  if (!accessToken || !refreshToken) {
    return null;
  }

  const supabaseUser = getSupabaseUserClient(accessToken);
  if (!supabaseUser) {
    return null;
  }

  const { data: userData } = await supabaseUser.auth.getUser();
  if (userData.user) {
    return { user: userData.user, accessToken, refreshToken, refreshed: false as const };
  }

  const { data: refreshData, error: refreshError } = await supabaseUser.auth.refreshSession({ refresh_token: refreshToken });
  if (refreshError || !refreshData.session?.access_token || !refreshData.session.refresh_token || !refreshData.user) {
    return null;
  }

  return {
    user: refreshData.user,
    accessToken: refreshData.session.access_token,
    refreshToken: refreshData.session.refresh_token,
    expiresIn: refreshData.session.expires_in,
    refreshed: true as const
  };
}

export async function requireAdminUser(request: Request) {
  const resolved = await resolveUserFromCookieSession(request);
  const supabaseAdmin = getSupabaseAdminClient();

  if (!resolved) {
    return { ok: false as const, status: 401, error: 'No valid admin session.' };
  }

  if (!supabaseAdmin) {
    return { ok: false as const, status: 500, error: 'Missing Supabase server configuration.' };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('user_id', resolved.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin') {
    return { ok: false as const, status: 403, error: 'Admin role is required.' };
  }

  return {
    ok: true as const,
    user: resolved.user,
    refreshedAccessToken: resolved.refreshed ? resolved.accessToken : null,
    refreshedRefreshToken: resolved.refreshed ? resolved.refreshToken : null,
    refreshedExpiresIn: resolved.refreshed ? resolved.expiresIn ?? undefined : undefined
  };
}
