'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchAdminSession } from '@/lib/admin-session';
import { BrandMark } from '@/components/brand-mark';
import { getAdminCsrfHeader } from '@/lib/csrf-client';

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const session = await fetchAdminSession();
      if (active && session?.role === 'admin') {
        router.replace('/admin');
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function signIn() {
    setIsLoading(true);
    setError(null);

    try {
      const loginResponse = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminCsrfHeader()
        },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const loginResult = await loginResponse.json().catch(() => ({}));
      if (!loginResponse.ok) {
        throw new Error(loginResult?.error ?? 'Đăng nhập thất bại.');
      }

      const nextPath = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('next')
        : null;
      router.push(nextPath && nextPath.startsWith('/admin') ? nextPath : '/admin');
      router.refresh();
    } catch (signInFailure) {
      setError(signInFailure instanceof Error ? signInFailure.message : 'Có lỗi khi đăng nhập.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12">
      <div className="w-full rounded-[2rem] border border-white/10 bg-[var(--panel)] p-8 shadow-glow">
        <BrandMark href="/" compact />
        <h1 className="mt-4 text-3xl font-bold">Đăng nhập quản trị</h1>
        <p className="mt-3 text-[var(--muted)]">Dùng tài khoản Supabase Auth đã được gán role admin trong bảng profiles.</p>

        <div className="mt-6 grid gap-4">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50"
            placeholder="admin@email.com"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[#ffd166]/50"
            placeholder="Mật khẩu"
          />
          <button
            type="button"
            onClick={signIn}
            disabled={isLoading || !email.trim() || !password}
            className="rounded-2xl border-0 bg-[var(--accent)] px-4 py-3 font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>

        <div className="mt-6 text-sm text-[var(--muted)]">
          <p>Nếu chưa có role admin, thêm record vào bảng profiles với cột role = admin.</p>
          <Link href="/" className="mt-2 inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-2">Về trang chủ</Link>
        </div>
      </div>
    </main>
  );
}
