import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';

const actions = [
  {
    href: '/admin',
    title: 'Tạo quiz',
    description: 'Tạo câu hỏi đúng/sai hoặc lựa chọn và lưu vào Supabase.'
  },
  {
    href: '/join',
    title: 'Tham gia phòng',
    description: 'Người chơi nhập mã phòng để vào game ngay.'
  }
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <section className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="space-y-6">
          <BrandMark />
          <h1 className="max-w-2xl text-5xl font-extrabold leading-tight md:text-7xl">
            Ứng dụng quiz realtime kiểu Kahoot cho Dự án 19.
          </h1>
          <p className="max-w-2xl text-lg text-[var(--muted)] md:text-xl">
            Quản trị tạo quiz, mở phòng chơi, người tham gia trả lời theo thời gian thực, hệ thống tự chấm điểm và tìm người thắng sau mỗi câu hỏi.
          </p>
          <div className="flex flex-wrap gap-4">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-2xl border border-white/10 bg-[var(--panel)] px-6 py-4 transition hover:-translate-y-1 hover:border-[#ffb000]/50"
              >
                <div className="text-lg font-semibold">{action.title}</div>
                <div className="mt-1 max-w-xs text-sm text-[var(--muted)]">{action.description}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-glow">
          <div className="grid gap-4 text-sm text-[var(--muted)]">
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
              Câu hỏi đúng/sai + câu hỏi nhiều lựa chọn
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
              Chấm điểm theo độ đúng và tốc độ trả lời
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
              Hiển thị xếp hạng sau mỗi câu và cuối game
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
