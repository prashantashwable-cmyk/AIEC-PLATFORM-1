'use client';

import { useState } from 'react';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { SEVERITY } from '@/lib/enums';
import { formatDateTime } from '@/lib/format';
import { useOffline } from './offline-provider';
import { SyncBar } from './sync-bar';

const INPUT = 'block w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm';

/** Hazard / defect report that works without a connection. HIGH and CRITICAL stop work once synced. */
export function HazardForm({ projects }: { projects: Array<{ id: string; label: string }> }) {
  const { t } = useI18n();
  const { enqueue } = useOffline();
  const [done, setDone] = useState(false);
  return (
    <div className="mx-auto max-w-xl">
      <SyncBar />
      <Card className="p-5">
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{t('m.emergencyFirst')}</p>
        {done && <p role="status" data-testid="hazard-saved" className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{navigator.onLine ? t('m.incidentReported') : t('err.OFFLINE')}</p>}
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget; const fd = new FormData(form);
          const description = String(fd.get('description') ?? '').trim();
          if (!description) return;
          await enqueue('HAZARD', {
            projectId: String(fd.get('projectId') || '') || null, severity: String(fd.get('severity')), description,
            immediateAction: String(fd.get('immediateAction') ?? '').trim() || null,
          }, `${t('nav.hazard')} · ${description.slice(0, 40)}`);
          form.reset(); setDone(true);
        }}>
          <label className="block text-sm font-medium">{t('f.project')}
            <select name="projectId" className={`${INPUT} mt-1`}><option value="">{t('common.none')}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label className="block text-sm font-medium">{t('f.severity')}
            <select name="severity" defaultValue="MEDIUM" className={`${INPUT} mt-1`}>{SEVERITY.map((s) => <option key={s} value={s}>{t(`e.severity.${s}`)}</option>)}</select>
            <span className="mt-1 block text-xs font-normal text-slate-500">{t('m.severityHint')}</span></label>
          <label className="block text-sm font-medium">{t('f.whatHappened')}<textarea name="description" required rows={3} className={`${INPUT} mt-1`} /></label>
          <label className="block text-sm font-medium">{t('f.immediateAction')}<textarea name="immediateAction" rows={2} className={`${INPUT} mt-1`} /></label>
          <Button type="submit" variant="danger" data-testid="hazard-submit">{t('a.reportIncident')}</Button>
        </form>
      </Card>
    </div>
  );
}

export function SyncQueue() {
  const { t, locale } = useI18n();
  const { items, retry, clearSynced } = useOffline();
  const sorted = [...items].reverse();
  return (
    <div className="mx-auto max-w-3xl">
      <SyncBar />
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-slate-600">{t('p.tech.queueNote')}</p>
          <Button size="sm" variant="secondary" onClick={() => void clearSynced()}>{t('a.clearSynced')}</Button>
        </div>
        {sorted.length === 0 ? <EmptyState title={t('p.tech.queueEmpty')} /> : (
          <ul className="divide-y divide-slate-100">{sorted.map((i) => (
            <li key={i.clientEventId} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm" data-testid="queue-item" data-status={i.status}>
              <span>{i.label}
                <span className="block text-xs text-slate-500">{t('f.deviceTime')}: {formatDateTime(i.capturedAt, locale)}{i.receivedAt ? ` · ${t('f.serverTime')}: ${formatDateTime(i.receivedAt, locale)}` : ''}</span>
                {i.error && i.status !== 'SYNCED' && <span className="block text-xs text-red-700">{t(`err.${i.error}`) === `err.${i.error}` ? i.error : t(`err.${i.error}`)} · {t('p.tech.attempts', { count: i.attempts })}</span>}</span>
              <span className="flex items-center gap-2">
                <Badge tone={i.status === 'SYNCED' ? 'green' : i.status === 'FAILED' ? 'red' : 'amber'}>{t(`e.syncStatus.${i.status}`)}</Badge>
                {i.status === 'FAILED' && <Button size="sm" variant="secondary" onClick={() => void retry(i.clientEventId)}>{t('common.retry')}</Button>}
              </span>
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
