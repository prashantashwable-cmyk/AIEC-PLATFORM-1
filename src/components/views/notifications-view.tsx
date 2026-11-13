import Link from 'next/link';
import { markReadAction } from '@/app/actions/app';
import { Pager } from '@/components/common';
import { ActionForm, SubmitButton } from '@/components/ui/form';
import { EmptyState, PageHeader, Section } from '@/components/ui';
import type { TFunction } from '@/i18n';
import type { Locale } from '@/lib/enums';
import { formatDateTime, formatINR } from '@/lib/format';
import type { Ctx } from '@/server/ctx';
import { listNotifications } from '@/server/services/notifications';

/** Notification text is stored as a type + parameters and rendered in the reader's own language. */
export function notificationText(t: TFunction, locale: Locale, type: string, params: Record<string, unknown>): string {
  const p: Record<string, string> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    const v = value === null || value === undefined ? '' : String(value);
    p[key] = key === 'amount' ? formatINR(v, locale) : ['status', 'result', 'severity'].includes(key) ? translateCode(t, v) : key === 'type' ? t(`e.complianceDocType.${v}`) : key === 'kind' ? t(`m.dataRequest.${v}`) : v;
  }
  return t(`n.${type}`, p);
}
const CODE_GROUPS = ['projectStatus', 'orderStatus', 'referralStatus', 'ticketStatus', 'milestoneStatus', 'partnerStatus', 'verificationStatus', 'qcResult', 'disputeStatus', 'incidentStatus', 'severity'];
/** Status codes inside notifications are shown through the same enum labels as the rest of the app. */
function translateCode(t: TFunction, code: string): string {
  for (const key of [`n.code.${code}`, ...CODE_GROUPS.map((g) => `e.${g}.${code}`)]) {
    const text = t(key);
    if (text !== key) return text;
  }
  return code;
}

export async function NotificationsView({ ctx, t, locale, page, basePath }: { ctx: Ctx; t: TFunction; locale: Locale; page: number; basePath: string }) {
  const data = await listNotifications(ctx, page);
  return (
    <>
      <PageHeader title={t('nav.notifications')} subtitle={t('p.notifications.subtitle')}
        actions={<ActionForm action={markReadAction} hideSuccess><input type="hidden" name="all" value="true" /><SubmitButton variant="secondary" size="sm">{t('a.markAllRead')}</SubmitButton></ActionForm>} />
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('p.notifications.empty')} /> : (
          <ul className="divide-y divide-slate-100">
            {data.rows.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className={n.read_at ? 'text-sm text-slate-700' : 'text-sm font-semibold text-slate-900'}>
                    {!n.read_at && <span className="mr-2 inline-block size-2 rounded-full bg-accent-500" aria-hidden />}
                    {notificationText(t, locale, n.type, n.params)}
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(n.created_at, locale)}</p>
                </div>
                {n.link && <Link href={n.link} className="text-sm font-medium text-brand-700 hover:underline">{t('common.open')}</Link>}
              </li>
            ))}
          </ul>
        )}
        <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => `${basePath}?page=${p}`} />
      </Section>
    </>
  );
}
