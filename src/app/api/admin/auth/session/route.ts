import { NextResponse } from 'next/server';
import { clearAdminAuthCookies, ensureAdminCsrfCookie, maybeAttachRefreshedCookies } from '@/lib/admin-cookie';
import { requireAdminUser } from '@/lib/auth';

export async function GET(request: Request) {
  const authorization = await requireAdminUser(request);
  if (!authorization.ok) {
    const denied = NextResponse.json({ error: authorization.error }, { status: authorization.status });
    clearAdminAuthCookies(denied);
    return denied;
  }

  const response = NextResponse.json({
    session: {
      userId: authorization.user.id,
      email: authorization.user.email ?? '',
      role: 'admin' as const
    }
  });

  maybeAttachRefreshedCookies(response, {
    accessToken: authorization.refreshedAccessToken,
    refreshToken: authorization.refreshedRefreshToken,
    expiresInSeconds: authorization.refreshedExpiresIn
  });
  ensureAdminCsrfCookie(response, request.headers.get('cookie'));

  return response;
}
