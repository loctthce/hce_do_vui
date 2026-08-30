import { NextResponse } from 'next/server';

export const ADMIN_ACCESS_COOKIE = 'quiz_arena_admin_at';
export const ADMIN_REFRESH_COOKIE = 'quiz_arena_admin_rt';
export const ADMIN_CSRF_COOKIE = 'quiz_arena_admin_csrf';
export const ADMIN_CSRF_HEADER = 'x-admin-csrf-token';

const commonCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/'
};

const csrfCookieOptions = {
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/'
};

export function readCookieFromHeader(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(';').map((item) => item.trim());
  for (const part of parts) {
    if (part.startsWith(`${cookieName}=`)) {
      return decodeURIComponent(part.slice(cookieName.length + 1));
    }
  }

  return null;
}

export function setAdminAuthCookies(response: NextResponse, values: { accessToken: string; refreshToken: string; expiresInSeconds?: number }) {
  const maxAge = values.expiresInSeconds && values.expiresInSeconds > 0 ? values.expiresInSeconds : 60 * 60;

  response.cookies.set(ADMIN_ACCESS_COOKIE, values.accessToken, {
    ...commonCookieOptions,
    maxAge
  });

  response.cookies.set(ADMIN_REFRESH_COOKIE, values.refreshToken, {
    ...commonCookieOptions,
    maxAge: 60 * 60 * 24 * 30
  });
}

export function maybeAttachRefreshedCookies(
  response: NextResponse,
  refreshed: { accessToken: string | null; refreshToken: string | null; expiresInSeconds?: number }
) {
  if (!refreshed.accessToken || !refreshed.refreshToken) {
    return;
  }

  setAdminAuthCookies(response, {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresInSeconds: refreshed.expiresInSeconds
  });
}

export function clearAdminAuthCookies(response: NextResponse) {
  response.cookies.set(ADMIN_ACCESS_COOKIE, '', {
    ...commonCookieOptions,
    maxAge: 0
  });

  response.cookies.set(ADMIN_REFRESH_COOKIE, '', {
    ...commonCookieOptions,
    maxAge: 0
  });

  response.cookies.set(ADMIN_CSRF_COOKIE, '', {
    ...csrfCookieOptions,
    maxAge: 0
  });
}

export function ensureAdminCsrfCookie(response: NextResponse, cookieHeader: string | null) {
  const existing = readCookieFromHeader(cookieHeader, ADMIN_CSRF_COOKIE);
  if (existing) {
    return existing;
  }

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  response.cookies.set(ADMIN_CSRF_COOKIE, token, {
    ...csrfCookieOptions,
    maxAge: 60 * 60 * 24 * 30
  });
  return token;
}

export function verifyAdminCsrf(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie');
  const cookieToken = readCookieFromHeader(cookieHeader, ADMIN_CSRF_COOKIE);
  const headerToken = request.headers.get(ADMIN_CSRF_HEADER);

  if (!cookieToken || !headerToken) {
    return false;
  }

  if (cookieToken.length !== headerToken.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < cookieToken.length; index += 1) {
    mismatch |= cookieToken.charCodeAt(index) ^ headerToken.charCodeAt(index);
  }

  return mismatch === 0;
}
