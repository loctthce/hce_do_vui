'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAdminSession, signOutAdminSession } from '@/lib/admin-session';
import { BrandMark } from '@/components/brand-mark';

type DashboardData = {
  metrics: {
    total_quizzes: number;
    total_rooms: number;
    finished_rooms: number;
    total_answers: number;
  };
  recentRooms: Array<{
    id: string;
    room_code: string;
    quiz_title: string;
    host_name: string;
    status: string;
    player_count: number;
    total_answers: number;
    winner: { player_name: string; score: number } | null;
    question_summaries: Array<{
      question_id: string;
      prompt: string;
      position: number;
      total_answers: number;
      correct_answers: number;
      winner_name: string | null;
      winner_points: number;
    }>;
  }>;
};

export function AdminHistoryDashboard() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const finishedRooms = useMemo(() => {
    return (dashboard?.recentRooms ?? []).filter((room) => room.status === 'finished');
  }, [dashboard?.recentRooms]);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const session = await fetchAdminSession();
      if (!session?.userId) {
        await signOutAdminSession();
        router.push('/admin/login?next=/admin/history');
        throw new Error('Bạn cần đăng nhập admin trước khi xem lịch sử.');
      }

      const response = await fetch('/api/admin/dashboard', {
        cache: 'no-store'
      });

      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          await signOutAdminSession();
          router.push('/admin/login?next=/admin/history');
        }
        throw new Error(result?.error ?? 'Không tải được dashboard.');
      }

      setDashboard(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Có lỗi xảy ra.');
      setDashboard(null);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-8 shadow-glow">
        <BrandMark href="/" compact />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="mt-4 text-3xl font-bold">Lịch sử phòng và kết quả</h1>
            <p className="mt-2 text-[var(--muted)]">Theo dõi các phiên chơi gần đây và người thắng của từng phòng.</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => void loadDashboard()} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">Làm mới</button>
            <Link href="/admin" className="rounded-2xl bg-[var(--accent2)] px-4 py-2 font-semibold text-black">Về quản trị</Link>
          </div>
        </div>

        {isLoading && <p className="mt-6 text-sm text-[var(--muted)]">Đang tải dữ liệu...</p>}
        {error && <p className="mt-6 text-sm text-[var(--danger)]">{error}</p>}

        {dashboard && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-sm text-[var(--muted)]">Quiz gần đây</div><div className="mt-2 text-2xl font-bold">{dashboard.metrics.total_quizzes}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-sm text-[var(--muted)]">Phòng gần đây</div><div className="mt-2 text-2xl font-bold">{dashboard.metrics.total_rooms}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-sm text-[var(--muted)]">Phòng kết thúc</div><div className="mt-2 text-2xl font-bold">{dashboard.metrics.finished_rooms}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-sm text-[var(--muted)]">Tổng lượt trả lời</div><div className="mt-2 text-2xl font-bold">{dashboard.metrics.total_answers}</div></div>
            </div>

            <div className="stagger-list space-y-4">
              {finishedRooms.map((room) => (
                <article key={room.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-[var(--muted)]">{room.quiz_title}</div>
                      <div className="mt-1 text-lg font-semibold">Phòng {room.room_code}</div>
                      <div className="mt-2">
                        <span className={`status-chip ${room.status === 'question' ? 'status-question' : room.status === 'reveal' ? 'status-reveal' : room.status === 'finished' ? 'status-finished' : 'status-lobby'}`}>
                          {room.status}
                        </span>
                      </div>
                    </div>
                    <Link href={`/play/${room.room_code}`} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2">Xem chi tiết</Link>
                  </div>
                  <div className="mt-2 text-sm text-[var(--muted)]">
                    Host {room.host_name} | {room.player_count} người chơi | {room.total_answers} lượt trả lời
                  </div>
                  <div className="mt-2 text-sm text-[var(--muted)]">
                    {room.winner ? `Người thắng chung cuộc: ${room.winner.player_name} (${room.winner.score})` : 'Chưa xác định người thắng'}
                  </div>
                </article>
              ))}

              {finishedRooms.length === 0 && (
                <p className="text-sm text-[var(--muted)]">Chưa có phòng kết thúc trong danh sách gần đây.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
