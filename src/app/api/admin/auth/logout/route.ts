import { NextResponse } from 'next/server';
import { clearAdminAuthCookies } from '@/lib/admin-cookie';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAdminAuthCookies(response);
  return response;
}
