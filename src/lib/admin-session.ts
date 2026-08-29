import { getAdminCsrfHeader } from '@/lib/csrf-client';

export type AdminSession = {
  userId: string;
  email: string;
  role: 'admin';
};

export async function fetchAdminSession(): Promise<AdminSession | null> {
  try {
    const response = await fetch('/api/admin/auth/session', {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    return result?.session ?? null;
  } catch {
    return null;
  }
}

export async function signOutAdminSession() {
  try {
    await fetch('/api/admin/auth/logout', {
      method: 'POST',
      headers: {
        ...getAdminCsrfHeader()
      }
    });
  } catch {
    // Ignore network failures during best-effort sign-out.
  }
}
