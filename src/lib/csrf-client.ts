import { ADMIN_CSRF_COOKIE, ADMIN_CSRF_HEADER } from '@/lib/admin-cookie';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const parts = document.cookie.split(';').map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }

  return null;
}

export function getAdminCsrfHeader(): Record<string, string> {
  const token = readCookie(ADMIN_CSRF_COOKIE);
  return token ? { [ADMIN_CSRF_HEADER]: token } : {};
}
