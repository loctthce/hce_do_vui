import { JoinForm } from '@/components/join-form';
import { BrandMark } from '@/components/brand-mark';

export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-5 px-6 py-12">
      <div className="flex justify-center md:justify-start">
        <BrandMark />
      </div>
      <JoinForm />
    </main>
  );
}
