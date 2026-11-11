import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/format';

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const BTN_VARIANT = {
  primary: 'bg-brand-600 text-on-brand hover:bg-brand-700',
  accent: 'bg-accent-500 text-on-accent hover:bg-accent-600',
  secondary: 'border border-slate-300 bg-surface text-slate-800 hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
} as const;
const BTN_SIZE = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' } as const;
export type ButtonVariant = keyof typeof BTN_VARIANT;
export type ButtonSize = keyof typeof BTN_SIZE;

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className);
}

export function Button({
  variant = 'primary', size = 'md', className, ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = 'primary', size = 'md', className, ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-surface shadow-sm', className)} {...props}>
      {children}
    </div>
  );
}

export function Section({
  title, description, actions, children, className,
}: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  );
}

export function PageHeader({
  title, subtitle, actions, back,
}: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
          <ChevronLeft className="size-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  red: 'bg-red-50 text-red-800 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-900 ring-amber-600/30',
  blue: 'bg-brand-50 text-brand-800 ring-brand-600/20',
  gray: 'bg-slate-100 text-slate-700 ring-slate-500/20',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', TONES[tone], className)}>
      {children}
    </span>
  );
}

const GREEN = new Set([
  'ACTIVE', 'VERIFIED', 'CONFIRMED', 'PAID', 'APPROVED', 'COMPLETED', 'PASS', 'HANDED_OVER', 'RESOLVED', 'QUALIFIED', 'SELECTED',
  'ACCEPTED', 'PARTNER_ACCEPTED', 'SYNCED', 'DELIVERED', 'REVIEWED', 'CONSENTED', 'SIGNED', 'LIVE', 'DONE', 'SURVEY_COMPLETED',
  'GOLD', 'PLATINUM', 'SILVER',
]);
const RED = new Set([
  'REJECTED', 'LOST', 'CANCELLED', 'SUSPENDED', 'EXPIRED', 'TERMINATED', 'FAIL', 'STOP_WORK', 'DISQUALIFIED', 'DECLINED',
  'PARTNER_DECLINED', 'FAILED', 'CRITICAL', 'EMERGENCY', 'EMERGENCY_ESCALATION', 'DISPUTED', 'REFUNDED', 'WITHDRAWN', 'DUE',
  'REFUND_REVERSAL',
]);
const AMBER = new Set([
  'ON_HOLD', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'CLARIFICATION_REQUESTED', 'REWORK', 'REWORK_REQUIRED', 'DUPLICATE', 'HIGH',
  'SANDBOX', 'UNVERIFIED', 'CONDITIONAL', 'NEGOTIATION', 'IN_NEGOTIATION', 'UNDER_RENEWAL', 'PENDING', 'PENDING_EVIDENCE',
  'PENDING_PARTNER_ACCEPTANCE', 'CONSENT_PENDING', 'SURVEY_PENDING', 'QUOTATION_PENDING', 'ORDER_PENDING', 'HANDOVER_PENDING',
  'DONE_PENDING_REVIEW', 'OPEN', 'ADJUSTMENT', 'MEDIUM', 'CORRECTIVE_ACTION', 'REPORTED',
]);
const GRAY = new Set(['DRAFT', 'CLOSED', 'UNGRADED', 'NONE', 'LOW', 'NOT_SELECTED', 'SUGGESTED', 'TODO', 'PLANNED', 'MANUAL', 'NORMAL']);

export function toneFor(value: string): Tone {
  if (GREEN.has(value)) return 'green';
  if (RED.has(value)) return 'red';
  if (AMBER.has(value)) return 'amber';
  if (GRAY.has(value)) return 'gray';
  return 'blue';
}

export function StatusBadge({ value, label }: { value: string; label: string }) {
  return <Badge tone={toneFor(value)}>{label}</Badge>;
}

export function Alert({ tone = 'blue', title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const styles = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    blue: 'border-brand-200 bg-brand-50 text-brand-950',
    gray: 'border-slate-200 bg-slate-50 text-slate-800',
  }[tone];
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', styles, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <Inbox className="size-9 text-slate-300" aria-hidden />
      <p className="mt-3 text-sm font-medium text-slate-800">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label, value, hint, tone = 'gray', href,
}: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; href?: string }) {
  const accent = { green: 'border-l-emerald-500', red: 'border-l-red-500', amber: 'border-l-amber-500', blue: 'border-l-brand-500', gray: 'border-l-slate-300' }[tone];
  const body = (
    <Card className={cn('h-full border-l-4 p-4', accent, href && 'transition-shadow hover:shadow-md')}>
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th scope="col" className={cn('border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold tracking-wide text-slate-600 uppercase', className)}>{children}</th>;
}
export function Td({ children, className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b border-slate-100 px-3 py-2.5 align-top text-slate-800', className)} {...props}>{children}</td>;
}

export function DataList({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 | 3 }) {
  const grid = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' }[columns];
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', grid)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-slate-900">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pagination({
  page, pageSize, total, hrefFor, labels,
}: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string; labels: { previous: string; next: string; summary: string } }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="px-1 pt-3 text-xs text-slate-500">{labels.summary}</p>;
  return (
    <nav className="flex items-center justify-between gap-3 pt-3" aria-label="pagination">
      <p className="text-xs text-slate-500">{labels.summary}</p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={buttonClass('secondary', 'sm')}><ChevronLeft className="size-4" aria-hidden />{labels.previous}</Link>
        ) : (
          <span className={buttonClass('secondary', 'sm', 'pointer-events-none opacity-40')}><ChevronLeft className="size-4" aria-hidden />{labels.previous}</span>
        )}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={buttonClass('secondary', 'sm')}>{labels.next}<ChevronRight className="size-4" aria-hidden /></Link>
        ) : (
          <span className={buttonClass('secondary', 'sm', 'pointer-events-none opacity-40')}>{labels.next}<ChevronRight className="size-4" aria-hidden /></span>
        )}
      </div>
    </nav>
  );
}

export function Tabs({ tabs, active }: { tabs: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <div className="mb-4 overflow-x-auto border-b border-slate-200">
      <nav className="flex min-w-max gap-1" aria-label="tabs">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
              tab.key === active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{tab.count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
