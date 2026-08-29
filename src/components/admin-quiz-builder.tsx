'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAdminSession, signOutAdminSession } from '@/lib/admin-session';
import { getAdminCsrfHeader } from '@/lib/csrf-client';

type QuestionType = 'true_false' | 'multiple_choice';

type QuestionDraft = {
  question_type: QuestionType;
  prompt: string;
  points: number;
  time_limit_seconds: number;
  options: Array<{ label: string; is_correct: boolean }>;
};

function createTrueFalseQuestion(): QuestionDraft {
  return {
    question_type: 'true_false',
    prompt: '',
    points: 1000,
    time_limit_seconds: 20,
    options: [
      { label: 'Đúng', is_correct: true },
      { label: 'Sai', is_correct: false }
    ]
  };
}

function createMultipleChoiceQuestion(): QuestionDraft {
  return {
    question_type: 'multiple_choice',
    prompt: '',
    points: 1000,
    time_limit_seconds: 20,
    options: [
      { label: 'Phương án A', is_correct: true },
      { label: 'Phương án B', is_correct: false },
      { label: 'Phương án C', is_correct: false },
      { label: 'Phương án D', is_correct: false }
    ]
  };
}

const emptyQuiz = {
  title: '',
  description: '',
  hostName: 'Admin',
  questions: [createTrueFalseQuestion()]
};

export function AdminQuizBuilder() {
  const router = useRouter();
  const [session, setSession] = useState<{ email: string; userId: string; role: 'admin' } | null>(null);

  const [title, setTitle] = useState(emptyQuiz.title);
  const [description, setDescription] = useState(emptyQuiz.description);
  const [hostName, setHostName] = useState(emptyQuiz.hostName);
  const [questions, setQuestions] = useState<QuestionDraft[]>(emptyQuiz.questions);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const current = await fetchAdminSession();
      if (active) {
        setSession(current);
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  const canSubmit = useMemo(() => {
    return !!session?.userId && title.trim().length > 0 && questions.every((question) => {
      return question.prompt.trim().length > 0 && question.options.some((option) => option.is_correct);
    });
  }, [questions, session?.userId, title]);

  function updateQuestion(index: number, updater: (draft: QuestionDraft) => QuestionDraft) {
    setQuestions((current) => current.map((question, questionIndex) => (questionIndex === index ? updater(question) : question)));
  }

  function updateOption(questionIndex: number, optionIndex: number, label: string) {
    updateQuestion(questionIndex, (draft) => ({
      ...draft,
      options: draft.options.map((option, index) => index === optionIndex ? { ...option, label } : option)
    }));
  }

  async function submitQuiz() {
    const currentSession = await fetchAdminSession();
    if (!currentSession?.userId) {
      await signOutAdminSession();
      setSession(null);
      setMessage('Bạn cần đăng nhập quản trị trước khi tạo quiz.');
      router.push('/admin/login?next=/admin');
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setRoomCode(null);

    try {
      const quizResponse = await fetch('/api/admin/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminCsrfHeader()
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          questions
        })
      });

      const quizResult = await quizResponse.json();
      if (!quizResponse.ok) {
        if (quizResponse.status === 401 || quizResponse.status === 403) {
          await signOutAdminSession();
          setSession(null);
          router.push('/admin/login?next=/admin');
        }
        throw new Error(quizResult?.error ?? 'Không thể tạo quiz.');
      }

      const roomResponse = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminCsrfHeader()
        },
        body: JSON.stringify({ quizId: quizResult.quizId, hostName: hostName.trim() })
      });

      const roomResult = await roomResponse.json();
      if (!roomResponse.ok) {
        if (roomResponse.status === 401 || roomResponse.status === 403) {
          await signOutAdminSession();
          setSession(null);
          router.push('/admin/login?next=/admin');
        }
        throw new Error(roomResult?.error ?? 'Không thể tạo phòng.');
      }

      setRoomCode(roomResult.roomCode);
      setMessage('Đã tạo quiz và phòng thành công.');
      router.prefetch(`/play/${roomResult.roomCode}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Có lỗi xảy ra.');
    } finally {
      setIsSaving(false);
    }
  }

  async function signOutAdmin() {
    await signOutAdminSession();
    setSession(null);
    router.push('/admin/login');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-glow">
        {!session?.userId && (
          <div className="mb-6 rounded-2xl border border-[#ef476f]/40 bg-[#ef476f]/10 px-4 py-3 text-sm text-[#ffc8d7]">
            Bạn chưa đăng nhập admin. Vào
            {' '}
            <Link href="/admin/login" className="font-semibold text-white underline">trang đăng nhập</Link>
            {' '}
            để tiếp tục.
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <span className="text-[var(--muted)]">Tài khoản: {session?.email ?? 'Chưa đăng nhập'}</span>
          <div className="flex gap-2">
            <Link href="/admin/history" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">Lịch sử phòng</Link>
            {session?.userId && (
              <button type="button" onClick={() => void signOutAdmin()} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">Đăng xuất</button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--muted)]">Tên quiz</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50" placeholder="VD: Vòng chung kết kiến thức" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--muted)]">Mô tả</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50" placeholder="Mô tả ngắn cho quiz" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--muted)]">Tên host</label>
            <input value={hostName} onChange={(event) => setHostName(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50" placeholder="VD: Quản trị viên" />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {questions.map((question, questionIndex) => (
            <article key={questionIndex} className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">Câu hỏi {questionIndex + 1}</h3>
                <select
                  value={question.question_type}
                  onChange={(event) => updateQuestion(questionIndex, () => event.target.value === 'true_false' ? createTrueFalseQuestion() : createMultipleChoiceQuestion())}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <option value="true_false">Đúng / Sai</option>
                  <option value="multiple_choice">Trắc nghiệm lựa chọn</option>
                </select>
              </div>

              <div className="mt-4 grid gap-4">
                <input
                  value={question.prompt}
                  onChange={(event) => updateQuestion(questionIndex, (draft) => ({ ...draft, prompt: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50"
                  placeholder="Nội dung câu hỏi"
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <input
                    type="number"
                    min={100}
                    value={question.points}
                    onChange={(event) => updateQuestion(questionIndex, (draft) => ({ ...draft, points: Number(event.target.value) }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50"
                    placeholder="Điểm"
                  />
                  <input
                    type="number"
                    min={5}
                    value={question.time_limit_seconds}
                    onChange={(event) => updateQuestion(questionIndex, (draft) => ({ ...draft, time_limit_seconds: Number(event.target.value) }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50"
                    placeholder="Giới hạn thời gian"
                  />
                </div>
                <div className="grid gap-3">
                  {question.options.map((option, optionIndex) => (
                    <label key={optionIndex} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <input
                        type="radio"
                        name={`correct-${questionIndex}`}
                        checked={option.is_correct}
                        onChange={() => updateQuestion(questionIndex, (draft) => ({
                          ...draft,
                          options: draft.options.map((currentOption, currentIndex) => ({
                            ...currentOption,
                            is_correct: currentIndex === optionIndex
                          }))
                        }))}
                        className="h-4 w-4"
                      />
                      <input
                        value={option.label}
                        onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                        className="w-full border-0 bg-transparent outline-none"
                        placeholder={`Đáp án ${optionIndex + 1}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setQuestions((current) => [...current, createMultipleChoiceQuestion()])}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-medium transition hover:border-[#06d6a0]/50"
          >
            Thêm câu hỏi
          </button>
          {questions.length > 1 && (
            <button
              type="button"
              onClick={() => setQuestions((current) => current.slice(0, -1))}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-medium transition hover:border-[#ef476f]/50"
            >
              Xóa câu hỏi cuối
            </button>
          )}
          <button
            type="button"
            disabled={!canSubmit || isSaving}
            onClick={submitQuiz}
            className="rounded-2xl bg-[var(--accent)] px-5 py-3 font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Đang lưu...' : 'Tạo quiz và phòng'}
          </button>
        </div>

        {message && <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>}
      </section>

      <aside className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-glow">
        <h2 className="text-xl font-semibold">Kết quả tạo</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Sau khi tạo thành công, bạn sẽ nhận được mã phòng để chia sẻ cho người chơi.</p>
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
          {roomCode ? (
            <>
              <div className="text-sm text-[var(--muted)]">Mã phòng</div>
              <div className="mt-2 text-4xl font-black tracking-[0.2em] text-[var(--accent)]">{roomCode}</div>
              <a href={`/play/${roomCode}`} className="mt-4 inline-flex rounded-2xl bg-[var(--accent2)] px-4 py-3 font-semibold text-black">
                Mở phòng ngay
              </a>
            </>
          ) : (
            <div className="text-sm text-[var(--muted)]">Mã phòng sẽ xuất hiện ở đây sau khi quiz được tạo.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
