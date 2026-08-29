import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE } from '@/lib/admin-cookie';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const hasAccess = Boolean(request.cookies.get(ADMIN_ACCESS_COOKIE)?.value);
    const hasRefresh = Boolean(request.cookies.get(ADMIN_REFRESH_COOKIE)?.value);

    if (!hasAccess || !hasRefresh) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/admin/login';
      redirectUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*']
};
