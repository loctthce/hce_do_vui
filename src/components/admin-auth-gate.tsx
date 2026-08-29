'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchAdminSession, signOutAdminSession } from '@/lib/admin-session';

export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    let active = true;

    async function verify() {
      const session = await fetchAdminSession();
      if (!session?.userId) {
        await signOutAdminSession();
        if (active) {
          router.replace('/admin/login');
        }
        return;
      }

      setIsAllowed(true);
      setIsChecking(false);
    }

    void verify();

    const refreshWatcher = window.setInterval(async () => {
      const session = await fetchAdminSession();
      if (!session && active) {
        await signOutAdminSession();
        router.replace(`/admin/login?next=${encodeURIComponent(pathname ?? '/admin')}`);
      }
    }, 45_000);

    return () => {
      active = false;
      window.clearInterval(refreshWatcher);
    };
  }, [pathname, router]);

  if (isChecking) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-12">
        <div className="rounded-3xl border border-white/10 bg-[var(--panel)] px-6 py-5 text-sm text-[var(--muted)]">
          Đang kiểm tra quyền quản trị...
        </div>
      </main>
    );
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
