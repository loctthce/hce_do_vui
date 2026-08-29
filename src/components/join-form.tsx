'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function JoinForm() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  async function joinRoom() {
    setError(null);
    setIsJoining(true);

    try {
      const response = await fetch(`/api/rooms/${roomCode.trim().toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: playerName.trim() })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error ?? 'Không thể vào phòng.');
      }

      localStorage.setItem(
        `quiz-arena-player:${roomCode.trim().toUpperCase()}`,
        JSON.stringify({ id: result.player.id, name: result.player.player_name })
      );
      router.push(`/play/${roomCode.trim().toUpperCase()}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Có lỗi xảy ra.');
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <div className="w-full rounded-[2rem] border border-white/10 bg-[var(--panel)] p-8 shadow-glow">
      <h1 className="text-3xl font-bold">Tham gia phòng</h1>
      <p className="mt-3 text-[var(--muted)]">Người chơi nhập mã phòng và tên hiển thị để vào game.</p>
      <div className="mt-6 grid gap-4">
        <input
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          maxLength={8}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50"
          placeholder="Mã phòng"
        />
        <input
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50"
          placeholder="Tên người chơi"
        />
        <button
          type="button"
          disabled={isJoining || !roomCode.trim() || !playerName.trim()}
          onClick={joinRoom}
          className="rounded-2xl bg-[var(--accent)] px-4 py-3 font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isJoining ? 'Đang vào phòng...' : 'Vào phòng'}
        </button>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>
    </div>
  );
}
