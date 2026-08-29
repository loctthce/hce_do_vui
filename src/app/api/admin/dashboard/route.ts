import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth';
import { maybeAttachRefreshedCookies } from '@/lib/admin-cookie';
import { getSupabaseAdminClient } from '@/lib/supabase';

export async function GET(request: Request) {
  const authorization = await requireAdminUser(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Missing Supabase service role key.' }, { status: 500 });
  }

  const [{ data: quizzes, error: quizzesError }, { data: rooms, error: roomsError }] = await Promise.all([
    supabaseAdmin
      .from('quizzes')
      .select('id, title, created_at')
      .eq('created_by', authorization.user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('rooms')
      .select('id, room_code, quiz_id, host_name, status, created_at, finished_at')
      .eq('host_user_id', authorization.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
  ]);

  if (quizzesError || roomsError) {
    return NextResponse.json({ error: quizzesError?.message ?? roomsError?.message ?? 'Unable to load dashboard.' }, { status: 500 });
  }

  const roomIds = (rooms ?? []).map((room) => room.id);
  const quizIds = (rooms ?? []).map((room) => room.quiz_id);

  const [{ data: players, error: playersError }, { data: questions, error: questionsError }, { data: answers, error: answersError }] = await Promise.all([
    roomIds.length > 0
      ? supabaseAdmin.from('room_players').select('id, room_id, player_name, score').in('room_id', roomIds)
      : Promise.resolve({ data: [], error: null }),
    quizIds.length > 0
      ? supabaseAdmin.from('questions').select('id, quiz_id, prompt, position').in('quiz_id', quizIds)
      : Promise.resolve({ data: [], error: null }),
    roomIds.length > 0
      ? supabaseAdmin
          .from('player_answers')
          .select('room_id, question_id, player_id, is_correct, points_awarded, response_time_ms, created_at')
          .in('room_id', roomIds)
          .order('created_at', { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (playersError || questionsError || answersError) {
    return NextResponse.json({ error: playersError?.message ?? questionsError?.message ?? answersError?.message ?? 'Unable to load dashboard details.' }, { status: 500 });
  }

  const quizTitleById = new Map((quizzes ?? []).map((quiz) => [quiz.id, quiz.title]));
  const playersByRoom = new Map<string, Array<{ id: string; player_name: string; score: number }>>();
  for (const player of players ?? []) {
    const list = playersByRoom.get(player.room_id) ?? [];
    list.push(player);
    playersByRoom.set(player.room_id, list);
  }

  const questionsByQuiz = new Map<string, Array<{ id: string; prompt: string; position: number }>>();
  for (const question of questions ?? []) {
    const list = questionsByQuiz.get(question.quiz_id) ?? [];
    list.push(question);
    questionsByQuiz.set(question.quiz_id, list);
  }

  const answersByRoom = new Map<string, typeof answers>();
  for (const answer of answers ?? []) {
    const list = answersByRoom.get(answer.room_id) ?? [];
    list.push(answer);
    answersByRoom.set(answer.room_id, list);
  }

  const recentRooms = (rooms ?? []).map((room) => {
    const roomPlayers = [...(playersByRoom.get(room.id) ?? [])].sort((left, right) => right.score - left.score);
    const roomAnswers = answersByRoom.get(room.id) ?? [];
    const questionMap = new Map((questionsByQuiz.get(room.quiz_id) ?? []).map((question) => [question.id, question]));
    const topPlayer = roomPlayers[0] ?? null;
    const questionSummaries = [...new Set(roomAnswers.map((answer) => answer.question_id))]
      .map((questionId) => {
        const currentAnswers = roomAnswers.filter((answer) => answer.question_id === questionId);
        const winner = [...currentAnswers].sort((left, right) => {
          if (right.points_awarded !== left.points_awarded) {
            return right.points_awarded - left.points_awarded;
          }

          return left.response_time_ms - right.response_time_ms;
        })[0] ?? null;

        const winnerName = winner ? roomPlayers.find((player) => player.id === winner.player_id)?.player_name ?? 'Người chơi' : null;
        return {
          question_id: questionId,
          prompt: questionMap.get(questionId)?.prompt ?? 'Câu hỏi',
          position: questionMap.get(questionId)?.position ?? 0,
          total_answers: currentAnswers.length,
          correct_answers: currentAnswers.filter((answer) => answer.is_correct).length,
          winner_name: winnerName,
          winner_points: winner?.points_awarded ?? 0
        };
      })
      .sort((left, right) => left.position - right.position);

    return {
      id: room.id,
      room_code: room.room_code,
      quiz_title: quizTitleById.get(room.quiz_id) ?? 'Quiz',
      host_name: room.host_name,
      status: room.status,
      created_at: room.created_at,
      finished_at: room.finished_at,
      player_count: roomPlayers.length,
      total_answers: roomAnswers.length,
      winner: topPlayer
        ? {
            player_name: topPlayer.player_name,
            score: topPlayer.score
          }
        : null,
      question_summaries: questionSummaries
    };
  });

  const response = NextResponse.json({
    metrics: {
      total_quizzes: quizzes?.length ?? 0,
      total_rooms: rooms?.length ?? 0,
      finished_rooms: recentRooms.filter((room) => room.status === 'finished').length,
      total_answers: answers?.length ?? 0
    },
    recentRooms
  });

  maybeAttachRefreshedCookies(response, {
    accessToken: authorization.refreshedAccessToken,
    refreshToken: authorization.refreshedRefreshToken,
    expiresInSeconds: authorization.refreshedExpiresIn
  });

  return response;
}
