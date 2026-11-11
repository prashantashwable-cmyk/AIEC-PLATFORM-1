import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert, FileText, Search } from 'lucide-react';
import type { TFunction } from '@/i18n';
import { PAGE_SIZE } from '@/lib/config';
import { cn } from '@/lib/format';
import { Pagination, buttonClass } from '@/components/ui';

export function enumOptions(t: TFunction, group: string, values: readonly string[]): Array<{ value: string; label: string }> {
  return values.map((value) => ({ value, label: t(`e.${group}.${value}`) }));
}

/** Filter form that works as a plain GET request (bookmarkable, no client state). */
export function FilterBar({ children, submitLabel, resetHref, resetLabel }: { children: ReactNode; submitLabel: string; resetHref: string; resetLabel: string }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-surface p-3">
      {children}
      <button type="submit" className={buttonClass('primary', 'sm')}><Search className="size-4" aria-hidden />{submitLabel}</button>
      <a href={resetHref} className={buttonClass('ghost', 'sm')}>{resetLabel}</a>
    </form>
  );
}

const CONTROL = 'block rounded-lg border border-slate-300 bg-surface px-2.5 py-1.5 text-sm text-slate-900';
export function FilterSelect({
  name, label, value, options, allLabel,
}: { name: string; label: string; value?: string; options: Array<{ value: string; label: string }>; allLabel: string }) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <select name={name} defaultValue={value ?? ''} className={cn(CONTROL, 'mt-1 min-w-36')}>
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
export function FilterText({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input name={name} defaultValue={value ?? ''} className={cn(CONTROL, 'mt-1 w-48')} />
    </label>
  );
}

export function Pager({
  t, page, total, hrefFor, pageSize = PAGE_SIZE,
}: { t: TFunction; page: number; total: number; hrefFor: (page: number) => string; pageSize?: number }) {
  return (
    <Pagination page={page} pageSize={pageSize} total={total} hrefFor={hrefFor}
      labels={{ previous: t('common.previous'), next: t('common.next'), summary: `${t('common.results', { count: total })} · ${t('common.pageOf', { page, pages: Math.max(1, Math.ceil(total / pageSize)) })}` }} />
  );
}

/** Link to a private document. The file route re-checks access and logs every download. */
export function FileLink({ id, label }: { id: string | null | undefined; label: string }) {
  if (!id) return <span className="text-slate-400">—</span>;
  return (
    <a href={`/api/files/${id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
      <FileText className="size-4" aria-hidden />{label}
    </a>
  );
}

export function Check({ ok, label, hint }: { ok: boolean; label: ReactNode; hint?: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />}
      <span className={ok ? 'text-slate-800' : 'font-medium text-amber-900'}>{label}{hint ? <span className="block text-xs font-normal text-slate-500">{hint}</span> : null}</span>
    </li>
  );
}

export function Timeline({ items }: { items: Array<{ key: string; title: ReactNode; meta: ReactNode; body?: ReactNode }> }) {
  return (
    <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
      {items.map((item) => (
        <li key={item.key} className="relative">
          <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-brand-500 ring-2 ring-white" aria-hidden />
          <p className="text-sm font-medium text-slate-900">{item.title}</p>
          <p className="text-xs text-slate-500">{item.meta}</p>
          {item.body && <p className="mt-0.5 text-sm text-slate-700">{item.body}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Two-column detail layout: main content with a narrower action column. */
export function Split({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">{main}</div>
      <div className="min-w-0 space-y-5">{side}</div>
    </div>
  );
}
