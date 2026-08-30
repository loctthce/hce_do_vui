import type { Metadata } from 'next';
import './globals.css';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata: Metadata = {
  title: 'Quiz Arena',
  description: 'Kahoot-style quiz app for quizzes, rooms and live scoring.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
