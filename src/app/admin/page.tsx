import { AdminQuizBuilder } from '@/components/admin-quiz-builder';
import { AdminAuthGate } from '@/components/admin-auth-gate';
import { BrandMark } from '@/components/brand-mark';
import Link from 'next/link';

export default function AdminPage() {
  return (
    <AdminAuthGate>
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
        <div className="mb-8 rounded-[2rem] border border-white/10 bg-[var(--panel)] p-8 shadow-glow">
          <BrandMark href="/" compact />
          <h1 className="text-3xl font-bold">Bảng quản trị quiz</h1>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Tạo quiz, thêm câu hỏi Đúng/Sai hoặc trắc nghiệm lựa chọn, rồi mở phòng chơi ngay từ cùng một màn hình.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/admin/login" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold">Đăng nhập admin</Link>
            <Link href="/admin/history" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold">Lịch sử phòng</Link>
          </div>
        </div>
        <AdminQuizBuilder />
      </main>
    </AdminAuthGate>
  );
}
