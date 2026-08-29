import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth';
import { maybeAttachRefreshedCookies, verifyAdminCsrf } from '@/lib/admin-cookie';
import { generateRoomCode } from '@/lib/room';
import { getSupabaseAdminClient } from '@/lib/supabase';

const createRoomSchema = z.object({
  quizId: z.string().uuid(),
  hostName: z.string().min(1)
});

export async function POST(request: Request) {
  if (!verifyAdminCsrf(request)) {
    return NextResponse.json({ error: 'CSRF token is missing or invalid.' }, { status: 403 });
  }

  const authorization = await requireAdminUser(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Missing Supabase service role key.' }, { status: 500 });
  }

  const parsed = createRoomSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const roomCode = generateRoomCode();
  const { data, error } = await supabaseAdmin
    .from('rooms')
    .insert({
      room_code: roomCode,
      quiz_id: parsed.data.quizId,
      host_user_id: authorization.user.id,
      host_name: parsed.data.hostName
    })
    .select('room_code')
    .single();

  if (error || !data) {
    const response = NextResponse.json({ error: error?.message ?? 'Unable to create room.' }, { status: 500 });
    maybeAttachRefreshedCookies(response, {
      accessToken: authorization.refreshedAccessToken,
      refreshToken: authorization.refreshedRefreshToken,
      expiresInSeconds: authorization.refreshedExpiresIn
    });
    return response;
  }

  const response = NextResponse.json({ roomCode: data.room_code });
  maybeAttachRefreshedCookies(response, {
    accessToken: authorization.refreshedAccessToken,
    refreshToken: authorization.refreshedRefreshToken,
    expiresInSeconds: authorization.refreshedExpiresIn
  });
  return response;
}
