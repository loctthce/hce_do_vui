import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';

const answerSchema = z.object({
  questionId: z.string().uuid(),
  playerId: z.string().uuid(),
  optionId: z.string().uuid().nullable(),
  responseTimeMs: z.number().int().nonnegative()
});

export async function POST(request: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Missing Supabase service role key.' }, { status: 500 });
  }

  const { roomCode } = await params;
  const parsed = answerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('id, status, current_question_index')
    .eq('room_code', roomCode)
    .single();
  if (!room) {
    return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  }

  if (room.status !== 'question') {
    return NextResponse.json({ error: 'Room is not accepting answers right now.' }, { status: 409 });
  }

  const { data: question } = await supabaseAdmin
    .from('questions')
    .select('id, points, question_type, position')
    .eq('id', parsed.data.questionId)
    .maybeSingle();

  if (!question) {
    return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
  }

  if (question.position !== room.current_question_index) {
    return NextResponse.json({ error: 'Question mismatch.' }, { status: 409 });
  }

  const { data: correctOption } = await supabaseAdmin
    .from('question_options')
    .select('id')
    .eq('question_id', question.id)
    .eq('is_correct', true)
    .maybeSingle();

  const isCorrect = question.question_type === 'true_false'
    ? Boolean(correctOption && parsed.data.optionId && parsed.data.optionId === correctOption.id)
    : Boolean(correctOption && parsed.data.optionId && parsed.data.optionId === correctOption.id);

  const pointsAwarded = isCorrect ? Math.max(100, question.points - Math.floor(parsed.data.responseTimeMs / 100)) : 0;

  const { data: previousAnswer } = await supabaseAdmin
    .from('player_answers')
    .select('points_awarded')
    .eq('room_id', room.id)
    .eq('question_id', question.id)
    .eq('player_id', parsed.data.playerId)
    .maybeSingle();

  const previousPoints = previousAnswer?.points_awarded ?? 0;

  const { error } = await supabaseAdmin.from('player_answers').upsert({
    room_id: room.id,
    question_id: question.id,
    player_id: parsed.data.playerId,
    selected_option_id: parsed.data.optionId,
    is_correct: isCorrect,
    response_time_ms: parsed.data.responseTimeMs,
    points_awarded: pointsAwarded
  }, { onConflict: 'room_id,question_id,player_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const scoreDelta = pointsAwarded - previousPoints;

  if (scoreDelta !== 0) {
    const { data: player } = await supabaseAdmin
      .from('room_players')
      .select('score')
      .eq('id', parsed.data.playerId)
      .maybeSingle();

    const nextScore = Math.max(0, (player?.score ?? 0) + scoreDelta);

    await supabaseAdmin
      .from('room_players')
      .update({ score: nextScore })
      .eq('id', parsed.data.playerId);
  }

  return NextResponse.json({ ok: true, isCorrect, pointsAwarded });
}
