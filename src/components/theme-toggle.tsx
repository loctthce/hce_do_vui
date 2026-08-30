'use client';

import { useEffect, useState } from 'react';

type AppTheme = 'light' | 'cinematic';

const STORAGE_KEY = 'quiz-arena-theme';

function applyTheme(theme: AppTheme) {
  if (typeof document === 'undefined') {
    return;
  }

  if (theme === 'cinematic') {
    document.documentElement.setAttribute('data-theme', 'cinematic');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<AppTheme>('light');

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as AppTheme | null) ?? 'light';
    const nextTheme: AppTheme = stored === 'cinematic' ? 'cinematic' : 'light';
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  function toggleTheme() {
    const nextTheme: AppTheme = theme === 'light' ? 'cinematic' : 'light';
    setTheme(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={toggleTheme}
      className="theme-toggle"
    >
      <span className="theme-toggle-dot" aria-hidden="true" />
      <span className="theme-toggle-text">{theme === 'light' ? 'Cinematic' : 'Light'}</span>
    </button>
  );
}
