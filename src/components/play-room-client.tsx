'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchAdminSession, signOutAdminSession } from '@/lib/admin-session';
import { BrandMark } from '@/components/brand-mark';
import { getAdminCsrfHeader } from '@/lib/csrf-client';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import type { RoomState } from '@/lib/types';

const PRESENTER_SETTINGS_KEY = 'quiz-arena-presenter-settings';

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
  const [presenterFocus, setPresenterFocus] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundLevel, setSoundLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [projectorMode, setProjectorMode] = useState(false);
  const [audienceSafeMode, setAudienceSafeMode] = useState(false);
  const [showPresenterControls, setShowPresenterControls] = useState(true);
  const currentQuestionIdRef = useRef<string | null>(null);
  const lastBeepSecondRef = useRef<number | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const presenterControlsTimerRef = useRef<number | null>(null);

  const roomStatus = room?.status ?? 'lobby';
  const roomStatusClass =
    roomStatus === 'question'
      ? 'status-question'
      : roomStatus === 'reveal'
        ? 'status-reveal'
        : roomStatus === 'finished'
          ? 'status-finished'
          : 'status-lobby';

  const currentQuestion = useMemo(() => {
    if (!room) {
      return null;
    }

    return room.questions[room.current_question_index] ?? null;
  }, [room]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(PRESENTER_SETTINGS_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        soundEnabled?: boolean;
        soundLevel?: 'low' | 'medium' | 'high';
        projectorMode?: boolean;
        audienceSafeMode?: boolean;
      };

      if (typeof parsed.soundEnabled === 'boolean') {
        setSoundEnabled(parsed.soundEnabled);
      }
      if (parsed.soundLevel === 'low' || parsed.soundLevel === 'medium' || parsed.soundLevel === 'high') {
        setSoundLevel(parsed.soundLevel);
      }
      if (typeof parsed.projectorMode === 'boolean') {
        setProjectorMode(parsed.projectorMode);
      }
      if (typeof parsed.audienceSafeMode === 'boolean') {
        setAudienceSafeMode(parsed.audienceSafeMode);
      }
    } catch {
      // Ignore invalid saved presenter settings.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload = {
      soundEnabled,
      soundLevel,
      projectorMode,
      audienceSafeMode
    };

    window.localStorage.setItem(PRESENTER_SETTINGS_KEY, JSON.stringify(payload));
  }, [audienceSafeMode, projectorMode, soundEnabled, soundLevel]);

  const loadState = useCallback(async () => {
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
  }, [roomCode]);

  useEffect(() => {
    setPlayer(getStoredPlayer(roomCode));
    void (async () => {
      const session = await fetchAdminSession();
      setHasAdminSession(Boolean(session?.userId));
    })();
    void loadState();
    const timer = window.setInterval(() => {
      void loadState();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadState, roomCode]);

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
  }, [loadState, room?.id, roomCode]);

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

  const advanceRoom = useCallback(async (action: 'start' | 'reveal' | 'next' | 'finish') => {
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
  }, [roomCode, router]);

  const playBeep = useCallback((frequency: number, durationMs: number) => {
    if (!soundEnabled || typeof window === 'undefined') {
      return;
    }

    try {
      const AudioContextImpl = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextImpl) {
        return;
      }

      const context = audioContextRef.current ?? new AudioContextImpl();
      audioContextRef.current = context;

      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      gainNode.gain.value = 0.0001;

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      const now = context.currentTime;
      const attack = 0.02;
      const release = Math.max(durationMs / 1000, 0.08);
      const volume = soundLevel === 'low' ? 0.06 : soundLevel === 'high' ? 0.2 : 0.12;

      gainNode.gain.exponentialRampToValueAtTime(volume, now + attack);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + release);
      oscillator.start(now);
      oscillator.stop(now + release + 0.02);
    } catch {
      // Silent fallback for browsers that block Web Audio.
    }
  }, [soundEnabled, soundLevel]);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') {
      return;
    }

    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => null);
      return;
    }

    await document.exitFullscreen().catch(() => null);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (projectorMode) {
      document.documentElement.setAttribute('data-projector', 'high-contrast');
    } else {
      document.documentElement.removeAttribute('data-projector');
    }
  }, [projectorMode]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (audienceSafeMode) {
      document.documentElement.setAttribute('data-motion', 'reduced');
    } else {
      document.documentElement.removeAttribute('data-motion');
    }
  }, [audienceSafeMode]);

  useEffect(() => {
    if (!presenterFocus) {
      setShowPresenterControls(true);
      if (presenterControlsTimerRef.current) {
        window.clearTimeout(presenterControlsTimerRef.current);
        presenterControlsTimerRef.current = null;
      }
      return;
    }

    const showThenHideControls = () => {
      setShowPresenterControls(true);
      if (presenterControlsTimerRef.current) {
        window.clearTimeout(presenterControlsTimerRef.current);
      }
      presenterControlsTimerRef.current = window.setTimeout(() => {
        setShowPresenterControls(false);
      }, 3500);
    };

    showThenHideControls();
    window.addEventListener('mousemove', showThenHideControls);
    window.addEventListener('touchstart', showThenHideControls);
    window.addEventListener('keydown', showThenHideControls);

    return () => {
      window.removeEventListener('mousemove', showThenHideControls);
      window.removeEventListener('touchstart', showThenHideControls);
      window.removeEventListener('keydown', showThenHideControls);
      if (presenterControlsTimerRef.current) {
        window.clearTimeout(presenterControlsTimerRef.current);
        presenterControlsTimerRef.current = null;
      }
    };
  }, [presenterFocus]);

  useEffect(() => {
    const currentStatus = room?.status ?? null;
    if (currentStatus === 'reveal' && lastStatusRef.current !== 'reveal') {
      playBeep(740, 220);
    }
    lastStatusRef.current = currentStatus;
  }, [playBeep, room?.status]);

  useEffect(() => {
    if (room?.status !== 'question' || timeLeftMs <= 0) {
      lastBeepSecondRef.current = null;
      return;
    }

    const seconds = Math.ceil(timeLeftMs / 1000);
    if (seconds <= 5 && seconds >= 1 && lastBeepSecondRef.current !== seconds) {
      playBeep(520 + (5 - seconds) * 35, 120);
      lastBeepSecondRef.current = seconds;
    }
  }, [playBeep, room?.status, timeLeftMs]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (typeof document !== 'undefined') {
        document.documentElement.removeAttribute('data-projector');
        document.documentElement.removeAttribute('data-motion');
      }
      if (presenterControlsTimerRef.current) {
        window.clearTimeout(presenterControlsTimerRef.current);
        presenterControlsTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!hasAdminSession) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (isTyping) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void advanceRoom('start');
      }
      if (key === 'r') {
        event.preventDefault();
        void advanceRoom('reveal');
      }
      if (key === 'n') {
        event.preventDefault();
        void advanceRoom('next');
      }
      if (key === 'f') {
        event.preventDefault();
        void advanceRoom('finish');
      }
      if (key === 'p') {
        event.preventDefault();
        setPresenterFocus((current) => !current);
      }
      if (key === 'm') {
        event.preventDefault();
        setAudienceSafeMode((current) => !current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advanceRoom, hasAdminSession]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 md:px-8">
      <div className={`grid gap-7 ${presenterFocus ? 'lg:grid-cols-1' : 'lg:grid-cols-[1.35fr_0.65fr]'}`}>
        <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-glow md:p-8">
          <BrandMark href="/" compact />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Mã phòng</div>
              <h1 className="mt-1 text-4xl font-extrabold tracking-[0.18em] text-[var(--accent)] md:text-5xl">{roomCode}</h1>
            </div>
            <div className={`status-chip ${roomStatusClass}`}>
              {room?.status ?? 'Đang tải'}
            </div>
          </div>

          <div className="mt-7 rounded-3xl border border-white/10 bg-black/20 p-5 md:p-6">
            {room?.status === 'finished' ? (
              <div className="space-y-6">
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Tổng kết trận đấu</div>
                  <h2 className="mt-2 text-3xl font-extrabold leading-tight">
                    {room.summary.winner ? `${room.summary.winner.player_name} chiến thắng` : 'Trận đấu đã kết thúc'}
                  </h2>
                  <p className="mt-2 text-[var(--muted)]">
                    {room.summary.winner ? `Điểm số chung cuộc: ${room.summary.winner.score}` : 'Chưa có người thắng do chưa có lượt trả lời hợp lệ.'}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-[var(--muted)]">Người chơi</div>
                    <div className="mt-2 text-3xl font-extrabold">{room.summary.player_count}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-[var(--muted)]">Câu đã có trả lời</div>
                    <div className="mt-2 text-3xl font-extrabold">{room.summary.answered_question_count}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-[var(--muted)]">Điểm trung bình</div>
                    <div className="mt-2 text-3xl font-extrabold">{room.summary.average_score}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {room.question_history.map((entry) => (
                    <div key={entry.question_id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Câu {entry.position + 1}</div>
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
              <div key={`${currentQuestion.id}:${room?.status ?? 'idle'}`} className="stage-shell reveal-flash">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                  <span>Câu hỏi {(room?.current_question_index ?? 0) + 1} / {room?.questions.length ?? 0}</span>
                  <span className={`quiz-timer rounded-full px-3 py-2 text-xs font-bold tracking-[0.08em] ${room?.status === 'question' && timeLeftMs > 5000 ? 'bg-[#2dc8a9]/20 text-[#1c8f78]' : 'bg-[#e0475a]/18 text-[#b63748]'} ${room?.status === 'question' && timeLeftMs <= 5000 ? 'quiz-timer-urgent' : ''}`}>
                    {room?.status === 'question' ? `${Math.ceil(timeLeftMs / 1000)}s` : room?.status === 'reveal' ? 'Reveal' : room?.status}
                  </span>
                </div>
                <h2 className="projector-text mt-3 text-3xl font-extrabold leading-tight md:text-4xl">{currentQuestion.prompt}</h2>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {currentQuestion.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={room?.status !== 'question' || timeLeftMs <= 0}
                      onClick={() => setSelectedOptionId(option.id)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${room?.status !== 'question' && room?.current_result?.correct_option_id === option.id ? 'border-[#2dc8a9]/60 bg-[#2dc8a9]/15' : selectedOptionId === option.id ? 'border-[#ffb000]/60 bg-[#ffb000]/16' : 'border-white/10 bg-white/5'} disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      <div className="font-semibold">{option.label}</div>
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
                    className="rounded-2xl border-0 bg-[var(--accent2)] px-5 py-3 font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Gửi đáp án
                  </button>
                  {answerState && <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">{answerState}</div>}
                </div>
                {room?.status !== 'question' && room?.current_result && (
                  <div className="reveal-flash mt-6 grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 md:grid-cols-2">
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
              </div>
            ) : (
              <p className="text-[var(--muted)]">Phòng đang chờ bắt đầu hoặc chưa có câu hỏi.</p>
            )}
          </div>

          {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
          <div className="mt-4 flex gap-3 text-sm text-[var(--muted)]">
            <Link href="/join" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 font-semibold">Đổi phòng</Link>
            <button type="button" onClick={() => void loadState()} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 font-semibold">Làm mới</button>
          </div>
        </section>

        <aside className={presenterFocus ? 'hidden' : 'space-y-6'}>
          <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-glow">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Điều khiển host</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setProjectorMode((current) => !current)}
                  title="Bật/tắt tăng tương phản cho máy chiếu"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]"
                >
                  {projectorMode ? 'Tắt Contrast+' : 'Contrast+'}
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((current) => !current)}
                  title="Bật hoặc tắt âm báo countdown và reveal"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]"
                >
                  {soundEnabled ? 'Tắt âm' : 'Bật âm'}
                </button>
                <button
                  type="button"
                  onClick={() => setSoundLevel((current) => current === 'low' ? 'medium' : current === 'medium' ? 'high' : 'low')}
                  title="Chuyển mức âm lượng: low, medium, high"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]"
                >
                  Âm: {soundLevel}
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceSafeMode((current) => !current)}
                  title="Bật/tắt chế độ giảm animation cho máy yếu"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]"
                >
                  {audienceSafeMode ? 'Animation: Off' : 'Animation: On'}
                </button>
                <button
                  type="button"
                  onClick={() => setPresenterFocus(true)}
                  title="Ẩn sidebar để chỉ hiển thị vùng câu hỏi"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]"
                >
                  Presenter Focus
                </button>
              </div>
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Đăng nhập ở trang admin để nhận quyền điều khiển phòng.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              <span className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1"><span className="kbd-chip">S</span>Bắt đầu</span>
              <span className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1"><span className="kbd-chip">R</span>Reveal</span>
              <span className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1"><span className="kbd-chip">N</span>Next</span>
              <span className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1"><span className="kbd-chip">F</span>Finish</span>
              <span className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1"><span className="kbd-chip">P</span>Focus</span>
              <span className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1"><span className="kbd-chip">M</span>Motion</span>
            </div>
            <div className="mt-3">
              <Link href="/admin/login" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                Đăng nhập quản trị
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              <button type="button" disabled={!hasAdminSession} onClick={() => void advanceRoom('start')} title="Bắt đầu game từ câu 1 (phím S)" className="rounded-2xl border-0 bg-[var(--accent)] px-4 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"><span className="action-icon">S</span>Bắt đầu</button>
              <button type="button" disabled={!hasAdminSession} onClick={() => void advanceRoom('reveal')} title="Hiển thị đáp án và kết quả câu hiện tại (phím R)" className="rounded-2xl bg-white/10 px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50"><span className="action-icon">R</span>Hiển thị đáp án</button>
              <button type="button" disabled={!hasAdminSession} onClick={() => void advanceRoom('next')} title="Chuyển sang câu hỏi tiếp theo (phím N)" className="rounded-2xl border-0 bg-[var(--accent2)] px-4 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"><span className="action-icon">N</span>Câu tiếp theo</button>
              <button type="button" disabled={!hasAdminSession} onClick={() => void advanceRoom('finish')} title="Kết thúc phòng và hiển thị tổng kết (phím F)" className="rounded-2xl bg-[#e0475a]/20 px-4 py-3 font-semibold text-[#9f2739] disabled:cursor-not-allowed disabled:opacity-50"><span className="action-icon">F</span>Kết thúc</button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-glow">
            <h2 className="text-xl font-semibold">Bảng xếp hạng</h2>
            <div className="stagger-list mt-4 space-y-3">
              {(room?.players ?? []).map((currentPlayer, index) => (
                <div key={currentPlayer.id} className="rank-row flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="font-medium"><span className="rank-badge">{index + 1}</span>{currentPlayer.player_name}</span>
                  <span className="rounded-full bg-[#ffb000]/15 px-3 py-1 text-sm font-bold text-[#c48400]">{currentPlayer.score}</span>
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

        {presenterFocus && (
          <div className={`presenter-controls fixed bottom-6 right-6 z-40 flex flex-col gap-2 ${showPresenterControls ? 'presenter-controls-visible' : 'presenter-controls-hidden'}`}>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              title="Bật/tắt toàn màn hình"
              className="rounded-2xl border border-white/10 bg-[var(--panel)] px-4 py-3 text-sm font-semibold"
            >
              Fullscreen
            </button>
            <button
              type="button"
              onClick={() => setProjectorMode((current) => !current)}
              title="Bật/tắt tăng tương phản cho máy chiếu"
              className="rounded-2xl border border-white/10 bg-[var(--panel)] px-4 py-3 text-sm font-semibold"
            >
              {projectorMode ? 'Tắt Contrast+' : 'Contrast+'}
            </button>
            <button
              type="button"
              onClick={() => setSoundEnabled((current) => !current)}
              title="Bật/tắt âm báo"
              className="rounded-2xl border border-white/10 bg-[var(--panel)] px-4 py-3 text-sm font-semibold"
            >
              {soundEnabled ? 'Tắt âm' : 'Bật âm'}
            </button>
            <button
              type="button"
              onClick={() => setSoundLevel((current) => current === 'low' ? 'medium' : current === 'medium' ? 'high' : 'low')}
              title="Chuyển mức âm lượng"
              className="rounded-2xl border border-white/10 bg-[var(--panel)] px-4 py-3 text-sm font-semibold"
            >
              Âm: {soundLevel}
            </button>
            <button
              type="button"
              onClick={() => setAudienceSafeMode((current) => !current)}
              title="Bật/tắt chế độ giảm animation"
              className="rounded-2xl border border-white/10 bg-[var(--panel)] px-4 py-3 text-sm font-semibold"
            >
              {audienceSafeMode ? 'Animation: Off' : 'Animation: On'}
            </button>
            <button
              type="button"
              onClick={() => setPresenterFocus(false)}
              title="Thoát chế độ Presenter Focus"
              className="rounded-2xl border border-white/10 bg-[var(--panel)] px-4 py-3 text-sm font-semibold"
            >
              Exit Presenter Focus
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
