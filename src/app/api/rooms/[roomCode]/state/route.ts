import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth';
import { maybeAttachRefreshedCookies, verifyAdminCsrf } from '@/lib/admin-cookie';
import { getRoomState } from '@/lib/room';
import { getSupabaseAdminClient } from '@/lib/supabase';

const actionSchema = z.object({
  action: z.enum(['start', 'reveal', 'next', 'finish'])
});

export async function GET(_: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const room = await getRoomState(roomCode);

  if (!room) {
    return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  }

  return NextResponse.json({ room });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ roomCode: string }> }) {
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

  const { roomCode } = await params;
  const parsed = actionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const currentRoom = await getRoomState(roomCode);
  if (!currentRoom) {
    return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  }

  if (currentRoom.host_user_id && currentRoom.host_user_id !== authorization.user.id) {
    return NextResponse.json({ error: 'Only the room host can control this room.' }, { status: 403 });
  }

  let status = currentRoom.status;
  let currentQuestionIndex = currentRoom.current_question_index;
  const lastQuestionIndex = currentRoom.questions.length - 1;

  if (parsed.data.action === 'start') {
    status = currentRoom.questions.length > 0 ? 'question' : 'finished';
    currentQuestionIndex = 0;
  }

  if (parsed.data.action === 'reveal') {
    status = 'reveal';
  }

  if (parsed.data.action === 'next') {
    if (currentQuestionIndex >= lastQuestionIndex) {
      status = 'finished';
    } else {
      currentQuestionIndex += 1;
      status = 'question';
    }
  }

  if (parsed.data.action === 'finish') {
    status = 'finished';
  }

  const updatePayload: Record<string, string | number | null> = {
    status,
    current_question_index: currentQuestionIndex,
    question_started_at: status === 'question' ? new Date().toISOString() : null
  };

  if (status === 'finished') {
    updatePayload.finished_at = new Date().toISOString();
  }

  if (parsed.data.action === 'start') {
    updatePayload.started_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('rooms')
    .update(updatePayload)
    .eq('room_code', roomCode);

  if (error) {
    const response = NextResponse.json({ error: error.message }, { status: 500 });
    maybeAttachRefreshedCookies(response, {
      accessToken: authorization.refreshedAccessToken,
      refreshToken: authorization.refreshedRefreshToken,
      expiresInSeconds: authorization.refreshedExpiresIn
    });
    return response;
  }

  const room = await getRoomState(roomCode);
  const response = NextResponse.json({ room });
  maybeAttachRefreshedCookies(response, {
    accessToken: authorization.refreshedAccessToken,
    refreshToken: authorization.refreshedRefreshToken,
    expiresInSeconds: authorization.refreshedExpiresIn
  });
  return response;
}
