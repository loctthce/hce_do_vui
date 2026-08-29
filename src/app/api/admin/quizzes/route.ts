import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth';
import { maybeAttachRefreshedCookies, verifyAdminCsrf } from '@/lib/admin-cookie';
import { getSupabaseAdminClient } from '@/lib/supabase';

const questionSchema = z.object({
  question_type: z.enum(['true_false', 'multiple_choice']),
  prompt: z.string().min(1),
  points: z.number().int().nonnegative().default(1000),
  time_limit_seconds: z.number().int().positive().default(20),
  options: z.array(
    z.object({
      label: z.string().min(1),
      is_correct: z.boolean()
    })
  ).min(2)
});

const quizSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  questions: z.array(questionSchema).min(1)
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

  const body = await request.json();
  const parsed = quizSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: quiz, error: quizError } = await supabaseAdmin
    .from('quizzes')
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      created_by: authorization.user.id
    })
    .select('id')
    .single();

  if (quizError || !quiz) {
    return NextResponse.json({ error: quizError?.message ?? 'Unable to create quiz.' }, { status: 500 });
  }

  const questionRows = parsed.data.questions.map((question, index) => ({
    quiz_id: quiz.id,
    question_type: question.question_type,
    prompt: question.prompt,
    points: question.points,
    time_limit_seconds: question.time_limit_seconds,
    position: index
  }));

  const { data: createdQuestions, error: questionError } = await supabaseAdmin
    .from('questions')
    .insert(questionRows)
    .select('id, position');

  if (questionError || !createdQuestions) {
    return NextResponse.json({ error: questionError?.message ?? 'Unable to create questions.' }, { status: 500 });
  }

  const optionRows = createdQuestions.flatMap((questionRow, questionIndex) =>
    parsed.data.questions[questionIndex].options.map((option, optionIndex) => ({
      question_id: questionRow.id,
      label: option.label,
      is_correct: option.is_correct,
      position: optionIndex
    }))
  );

  const { error: optionError } = await supabaseAdmin.from('question_options').insert(optionRows);

  if (optionError) {
    const response = NextResponse.json({ error: optionError.message }, { status: 500 });
    maybeAttachRefreshedCookies(response, {
      accessToken: authorization.refreshedAccessToken,
      refreshToken: authorization.refreshedRefreshToken,
      expiresInSeconds: authorization.refreshedExpiresIn
    });
    return response;
  }

  const response = NextResponse.json({ ok: true, quizId: quiz.id });
  maybeAttachRefreshedCookies(response, {
    accessToken: authorization.refreshedAccessToken,
    refreshToken: authorization.refreshedRefreshToken,
    expiresInSeconds: authorization.refreshedExpiresIn
  });
  return response;
}
