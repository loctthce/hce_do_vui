import Link from 'next/link';

type BrandMarkProps = {
  href?: string;
  compact?: boolean;
};

export function BrandMark({ href = '/', compact = false }: BrandMarkProps) {
  const content = (
    <div className={`inline-flex items-center gap-3 ${compact ? 'text-sm' : 'text-base'}`}>
      <span className="brand-orb" aria-hidden="true" />
      <span className="brand-copy">
        <span className="brand-title">Quiz Arena</span>
        {!compact && <span className="brand-subtitle">Realtime Competition Platform</span>}
      </span>
    </div>
  );

  return (
    <Link href={href} className="brand-link" aria-label="Quiz Arena home">
      {content}
    </Link>
  );
}
