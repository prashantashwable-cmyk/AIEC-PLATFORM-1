import { cn } from '@/lib/format';

export function Logo({ dark = false, className, tagline }: { dark?: boolean; className?: string; tagline?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 40 40" className="size-9 shrink-0" aria-hidden>
        <rect width="40" height="40" rx="9" className={dark ? 'fill-white' : 'fill-brand-700'} />
        <rect x="11" y="8" width="18" height="24" rx="2.5" fill="none" strokeWidth="2.2" className={dark ? 'stroke-brand-800' : 'stroke-white'} />
        <path d="M20 8v24" strokeWidth="1.6" className={dark ? 'stroke-brand-800' : 'stroke-white'} />
        <path d="M15.5 17.5 13.6 20h3.8zM24.5 22.5l1.9-2.5h-3.8z" className="fill-accent-500" />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className={cn('text-lg font-bold tracking-wide', dark ? 'text-white' : 'text-brand-900')}>AIEC</span>
        {tagline && <span className={cn('text-[11px] font-medium', dark ? 'text-brand-200' : 'text-slate-500')}>{tagline}</span>}
      </span>
    </span>
  );
}
