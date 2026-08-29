import { randomBytes } from 'node:crypto';
import { getSupabaseAdminClient } from './supabase';
import type { Quiz, QuizOption, QuizQuestion, RoomState } from './types';

export function generateRoomCode() {
  return randomBytes(3).toString('hex').toUpperCase();
}

export async function getQuizById(quizId: string): Promise<Quiz | null> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    throw new Error('Supabase service role key is required.');
  }

  const { data: quiz, error: quizError } = await supabaseAdmin
    .from('quizzes')
    .select('id, title, description, created_by, is_published')
    .eq('id', quizId)
    .maybeSingle();

  if (quizError || !quiz) {
    return null;
  }

  const { data: questions, error: questionsError } = await supabaseAdmin
    .from('questions')
    .select('id, quiz_id, question_type, prompt, points, time_limit_seconds, position')
    .eq('quiz_id', quizId)
    .order('position', { ascending: true });

  if (questionsError) {
    throw questionsError;
  }

  const questionIds = questions.map((question) => question.id);
  const { data: options, error: optionsError } = await supabaseAdmin
    .from('question_options')
    .select('id, question_id, label, is_correct, position')
    .in('question_id', questionIds)
    .order('position', { ascending: true });

  if (optionsError) {
    throw optionsError;
  }

  const groupedOptions = new Map<string, QuizOption[]>();
  for (const option of options ?? []) {
    const list = groupedOptions.get(option.question_id) ?? [];
    list.push(option);
    groupedOptions.set(option.question_id, list);
  }

  return {
    ...quiz,
    questions: questions.map((question) => ({
      ...question,
      options: groupedOptions.get(question.id) ?? []
    }))
  };
}

export async function getRoomState(roomCode: string): Promise<RoomState | null> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    throw new Error('Supabase service role key is required.');
  }

  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id, room_code, quiz_id, host_user_id, host_name, status, current_question_index, started_at, finished_at, question_started_at')
    .eq('room_code', roomCode)
    .maybeSingle();

  if (roomError || !room) {
    return null;
  }

  const quiz = await getQuizById(room.quiz_id);
  if (!quiz) {
    return null;
  }

  const { data: players, error: playersError } = await supabaseAdmin
    .from('room_players')
    .select('id, player_name, score')
    .eq('room_id', room.id)
    .order('score', { ascending: false });

  if (playersError) {
    throw playersError;
  }

  const currentQuestion = quiz.questions[room.current_question_index] ?? null;
  const { data: allAnswers, error: allAnswersError } = await supabaseAdmin
    .from('player_answers')
    .select('question_id, player_id, selected_option_id, is_correct, response_time_ms, points_awarded')
    .eq('room_id', room.id);

  if (allAnswersError) {
    throw allAnswersError;
  }

  const playerMap = new Map((players ?? []).map((player) => [player.id, player.player_name]));
  const allAnswersList = allAnswers ?? [];
  let currentResult: RoomState['current_result'] = null;

  if (currentQuestion) {
    const answers = allAnswersList.filter((answer) => answer.question_id === currentQuestion.id);

    const correctOption = currentQuestion.options.find((option) => option.is_correct) ?? null;
    const optionStats = currentQuestion.options.map((option) => ({
      option_id: option.id,
      label: option.label,
      picks: answers.filter((answer) => answer.selected_option_id === option.id).length,
      is_correct: option.is_correct
    }));

    const winnerAnswer = [...answers]
      .sort((left, right) => {
        if (right.points_awarded !== left.points_awarded) {
          return right.points_awarded - left.points_awarded;
        }

        return left.response_time_ms - right.response_time_ms;
      })[0] ?? null;

    currentResult = {
      correct_option_id: correctOption?.id ?? null,
      correct_player_count: answers.filter((answer) => answer.is_correct).length,
      total_answers: answers.length,
      winner: winnerAnswer
        ? {
            player_id: winnerAnswer.player_id,
            player_name: playerMap.get(winnerAnswer.player_id) ?? 'Người chơi',
            points_awarded: winnerAnswer.points_awarded,
            response_time_ms: winnerAnswer.response_time_ms
          }
        : null,
      option_stats: optionStats
    };
  }

  const questionHistory = quiz.questions.map((question) => {
    const answers = allAnswersList.filter((answer) => answer.question_id === question.id);
    const winnerAnswer = [...answers].sort((left, right) => {
      if (right.points_awarded !== left.points_awarded) {
        return right.points_awarded - left.points_awarded;
      }

      return left.response_time_ms - right.response_time_ms;
    })[0] ?? null;

    return {
      question_id: question.id,
      prompt: question.prompt,
      position: question.position,
      total_answers: answers.length,
      correct_answers: answers.filter((answer) => answer.is_correct).length,
      winner: winnerAnswer
        ? {
            player_id: winnerAnswer.player_id,
            player_name: playerMap.get(winnerAnswer.player_id) ?? 'Người chơi',
            points_awarded: winnerAnswer.points_awarded,
            response_time_ms: winnerAnswer.response_time_ms
          }
        : null
    };
  });

  const scoreTotal = (players ?? []).reduce((sum, player) => sum + player.score, 0);

  return {
    ...room,
    questions: quiz.questions,
    players: players ?? [],
    summary: {
      winner: players?.[0] ?? null,
      player_count: players?.length ?? 0,
      answered_question_count: questionHistory.filter((entry) => entry.total_answers > 0).length,
      average_score: (players?.length ?? 0) > 0 ? Math.round(scoreTotal / (players?.length ?? 1)) : 0
    },
    question_history: questionHistory,
    current_result: currentResult
  };
}
