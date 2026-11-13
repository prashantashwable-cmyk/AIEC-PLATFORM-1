import { cn } from '@/lib/format';

/** AIEC mark. The wordmark inherits the surrounding text colour so it works on any themed surface. */
export function Logo({ className, tagline }: { className?: string; tagline?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 40 40" className="size-9 shrink-0" aria-hidden>
        <rect width="40" height="40" rx="10" className="fill-brand-600" />
        <rect x="11" y="8" width="18" height="24" rx="2.5" fill="none" strokeWidth="2.2" className="stroke-on-brand" />
        <path d="M20 8v24" strokeWidth="1.6" className="stroke-on-brand" />
        <path d="M15.5 17.5 13.6 20h3.8zM24.5 22.5l1.9-2.5h-3.8z" className="fill-accent-400" />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-extrabold tracking-wide">AIEC</span>
        {tagline && <span className="text-[11px] font-medium opacity-70">{tagline}</span>}
      </span>
    </span>
  );
}
