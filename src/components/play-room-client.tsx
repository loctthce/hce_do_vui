'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchAdminSession, signOutAdminSession } from '@/lib/admin-session';
import { getAdminCsrfHeader } from '@/lib/csrf-client';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import type { RoomState } from '@/lib/types';

function getStoredPlayer(roomCode: string) {
  try {
    const raw = localStorage.getItem(`quiz-arena-player:${roomCode}`);
    return raw ? (JSON.parse(raw) as { id: string; name: string }) : null;
  } catch {
    return null;
  }
}

export function PlayRoomClient({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<{ id: string; name: string } | null>(null);
  const [hasAdminSession, setHasAdminSession] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<string | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(Date.now());
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const currentQuestionIdRef = useRef<string | null>(null);

  const currentQuestion = useMemo(() => {
    if (!room) {
      return null;
    }

    return room.questions[room.current_question_index] ?? null;
  }, [room]);

  async function loadState() {
    try {
      const response = await fetch(`/api/rooms/${roomCode}/state`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error ?? 'Không tải được trạng thái phòng.');
      }

      setRoom(result.room);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Có lỗi xảy ra.');
    }
  }

  useEffect(() => {
    setPlayer(getStoredPlayer(roomCode));
    void (async () => {
      const session = await fetchAdminSession();
      setHasAdminSession(Boolean(session?.userId));
    })();
    void loadState();
    const timer = window.setInterval(loadState, 5000);
    return () => window.clearInterval(timer);
  }, [roomCode]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    try {
      const supabase = getSupabaseBrowserClient();
      const roomChannel = supabase
        .channel(`room-state:${roomCode}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` }, () => {
          if (!cancelled) {
            void loadState();
          }
        })
        .subscribe();

      const playerChannel = room?.id
        ? supabase
            .channel(`room-players:${room.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${room.id}` }, () => {
              if (!cancelled) {
                void loadState();
              }
            })
            .subscribe()
        : null;

      cleanup = () => {
        cancelled = true;
        void supabase.removeChannel(roomChannel);
        if (playerChannel) {
          void supabase.removeChannel(playerChannel);
        }
      };
    } catch {
      cleanup = () => {
        cancelled = true;
      };
    }

    return cleanup;
  }, [room?.id, roomCode]);

  useEffect(() => {
    const questionId = currentQuestion?.id ?? null;
    if (questionId && currentQuestionIdRef.current !== questionId) {
      currentQuestionIdRef.current = questionId;
      setSelectedOptionId(null);
      setAnswerState(null);
      setQuestionStartedAt(room?.question_started_at ? new Date(room.question_started_at).getTime() : Date.now());
    }
  }, [currentQuestion?.id, room?.question_started_at]);

  useEffect(() => {
    if (!currentQuestion || room?.status !== 'question') {
      setTimeLeftMs(0);
      return;
    }

    const updateCountdown = () => {
      const startedAt = room?.question_started_at ? new Date(room.question_started_at).getTime() : questionStartedAt;
      const expiresAt = startedAt + currentQuestion.time_limit_seconds * 1000;
      setTimeLeftMs(Math.max(0, expiresAt - Date.now()));
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [currentQuestion, questionStartedAt, room?.question_started_at, room?.status]);

  async function sendAnswer() {
    if (!currentQuestion || !player || !selectedOptionId || timeLeftMs <= 0) {
      return;
    }

    const responseTimeMs = Date.now() - questionStartedAt;
    const response = await fetch(`/api/rooms/${roomCode}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        playerId: player.id,
        optionId: selectedOptionId,
        responseTimeMs
      })
    });

    const result = await response.json();
    if (!response.ok) {
      setAnswerState(result?.error ?? 'Không gửi được đáp án.');
      return;
    }

    setAnswerState(result.isCorrect ? `Chính xác +${result.pointsAwarded} điểm` : 'Sai rồi');
    await loadState();
  }

  async function advanceRoom(action: 'start' | 'reveal' | 'next' | 'finish') {
    const session = await fetchAdminSession();
    if (!session?.userId) {
      await signOutAdminSession();
      setHasAdminSession(false);
      router.push('/admin/login?next=/play/' + roomCode);
      return;
    }

    const response = await fetch(`/api/rooms/${roomCode}/state`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminCsrfHeader()
      },
      body: JSON.stringify({ action })
    });

    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await signOutAdminSession();
        setHasAdminSession(false);
        router.push('/admin/login?next=/play/' + roomCode);
      }
      setError(result?.error ?? 'Không cập nhật được trạng thái phòng.');
      return;
    }

    setHasAdminSession(true);
    setRoom(result.room);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-8 shadow-glow">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-[var(--muted)]">Mã phòng</div>
              <h1 className="text-4xl font-black tracking-[0.2em] text-[var(--accent)]">{roomCode}</h1>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--muted)]">
              {room?.status ?? 'Đang tải...'}
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-6">
            {room?.status === 'finished' ? (
              <div className="space-y-6">
                <div>
                  <div className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Tổng kết trận đấu</div>
                  <h2 className="mt-3 text-3xl font-bold leading-tight">
                    {room.summary.winner ? `${room.summary.winner.player_name} chiến thắng` : 'Trận đấu đã kết thúc'}
                  </h2>
                  <p className="mt-2 text-[var(--muted)]">
                    {room.summary.winner ? `Điểm số chung cuộc: ${room.summary.winner.score}` : 'Chưa có người thắng do chưa có lượt trả lời hợp lệ.'}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-[var(--muted)]">Người chơi</div>
                    <div className="mt-2 text-2xl font-bold">{room.summary.player_count}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-[var(--muted)]">Câu đã có trả lời</div>
                    <div className="mt-2 text-2xl font-bold">{room.summary.answered_question_count}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-[var(--muted)]">Điểm trung bình</div>
                    <div className="mt-2 text-2xl font-bold">{room.summary.average_score}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {room.question_history.map((entry) => (
                    <div key={entry.question_id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm text-[var(--muted)]">Câu {entry.position + 1}</div>
                      <div className="mt-1 font-semibold">{entry.prompt}</div>
                      <div className="mt-2 text-sm text-[var(--muted)]">
                        {entry.correct_answers}/{entry.total_answers} trả lời đúng
                      </div>
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        {entry.winner ? `Thắng câu: ${entry.winner.player_name} (+${entry.winner.points_awarded})` : 'Chưa có người thắng câu này'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : currentQuestion ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
                  <span>Câu hỏi {(room?.current_question_index ?? 0) + 1} / {room?.questions.length ?? 0}</span>
                  <span className={`rounded-full px-3 py-2 tracking-normal ${room?.status === 'question' && timeLeftMs > 5000 ? 'bg-[#06d6a0]/15 text-[#9df0d7]' : 'bg-[#ef476f]/15 text-[#ffb3c5]'}`}>
                    {room?.status === 'question' ? `${Math.ceil(timeLeftMs / 1000)}s` : room?.status === 'reveal' ? 'Reveal' : room?.status}
                  </span>
                </div>
                <h2 className="mt-3 text-3xl font-bold leading-tight">{currentQuestion.prompt}</h2>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {currentQuestion.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={room?.status !== 'question' || timeLeftMs <= 0}
                      onClick={() => setSelectedOptionId(option.id)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${room?.status !== 'question' && room?.current_result?.correct_option_id === option.id ? 'border-[#06d6a0]/60 bg-[#06d6a0]/15' : selectedOptionId === option.id ? 'border-[#ffd166]/60 bg-[#ffd166]/15' : 'border-white/10 bg-white/5'} disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      <div className="font-medium">{option.label}</div>
                      {room?.status !== 'question' && (
                        <div className="mt-2 text-xs text-[var(--muted)]">
                          {room?.current_result?.option_stats.find((entry) => entry.option_id === option.id)?.picks ?? 0} lượt chọn
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={room?.status !== 'question' || !selectedOptionId || timeLeftMs <= 0}
                    onClick={sendAnswer}
                    className="rounded-2xl bg-[var(--accent2)] px-5 py-3 font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Gửi đáp án
                  </button>
                  {answerState && <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">{answerState}</div>}
                </div>
                {room?.status !== 'question' && room?.current_result && (
                  <div className="mt-6 grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-[var(--muted)]">Kết quả câu hỏi</div>
                      <div className="mt-2 text-lg font-semibold text-[var(--accent)]">
                        {room.current_result.correct_player_count}/{room.current_result.total_answers} trả lời đúng
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-[var(--muted)]">Người thắng câu này</div>
                      <div className="mt-2 text-lg font-semibold">
                        {room.current_result.winner ? `${room.current_result.winner.player_name} (+${room.current_result.winner.points_awarded})` : 'Chưa có người thắng'}
                      </div>
                      {room.current_result.winner && (
                        <div className="mt-1 text-sm text-[var(--muted)]">{(room.current_result.winner.response_time_ms / 1000).toFixed(2)} giây</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[var(--muted)]">Phòng đang chờ bắt đầu hoặc chưa có câu hỏi.</p>
            )}
          </div>

          {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
          <div className="mt-4 flex gap-3 text-sm text-[var(--muted)]">
            <Link href="/join" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">Đổi phòng</Link>
            <button type="button" onClick={loadState} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">Làm mới</button>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-glow">
            <h2 className="text-xl font-semibold">Điều khiển host</h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Đăng nhập ở trang admin để nhận quyền điều khiển phòng.
            </p>
            <div className="mt-3">
              <Link href="/admin/login" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                Đăng nhập quản trị
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              <button type="button" disabled={!hasAdminSession} onClick={() => void advanceRoom('start')} className="rounded-2xl bg-white/10 px-4 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50">Bắt đầu</button>
              <button type="button" disabled={!hasAdminSession} onClick={() => void advanceRoom('reveal')} className="rounded-2xl bg-white/10 px-4 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50">Hiển thị đáp án</button>
              <button type="button" disabled={!hasAdminSession} onClick={() => void advanceRoom('next')} className="rounded-2xl bg-white/10 px-4 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50">Câu tiếp theo</button>
              <button type="button" disabled={!hasAdminSession} onClick={() => void advanceRoom('finish')} className="rounded-2xl bg-white/10 px-4 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50">Kết thúc</button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-glow">
            <h2 className="text-xl font-semibold">Bảng xếp hạng</h2>
            <div className="mt-4 space-y-3">
              {(room?.players ?? []).map((currentPlayer, index) => (
                <div key={currentPlayer.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span>{index + 1}. {currentPlayer.player_name}</span>
                  <span className="font-semibold text-[var(--accent)]">{currentPlayer.score}</span>
                </div>
              ))}
              {room?.players?.length === 0 && <p className="text-sm text-[var(--muted)]">Chưa có người chơi.</p>}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-glow">
            <h2 className="text-xl font-semibold">Trạng thái phòng</h2>
            <div className="mt-3 text-sm text-[var(--muted)]">
              <div>Host: {room?.host_name ?? 'Đang tải...'}</div>
              <div>Người chơi: {room?.players.length ?? 0}</div>
              <div>Câu hỏi: {room?.questions.length ?? 0}</div>
              <div>Người dùng hiện tại: {player?.name ?? 'Chưa tham gia'}</div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
