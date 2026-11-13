'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, LogIn, LogOut } from 'lucide-react';
import { Badge, Button, Card, EmptyState, StatusBadge } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { formatDate } from '@/lib/format';
import { cacheStore, fileToUpload } from '@/lib/offline-queue';
import { useOffline } from './offline-provider';
import { SyncBar } from './sync-bar';

type Task = { id: string; title: string; description: string | null; status: string; safety_critical: boolean; due_date: string | null; progress_note: string | null; review_note: string | null; project_id: string; project_number: string; project_status: string; project_name: string };
type Project = { id: string; project_number: string; status: string; project_name: string; address: string };
type Work = { tasks: Task[]; projects: Project[] };

const INPUT = 'block w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm';
const CHECKS = ['ppeOk', 'barricadeOk', 'powerIsolatedOk', 'toolsOk', 'pitShaftSafeOk'] as const;

function position(): Promise<{ latitude: number | null; longitude: number | null; accuracyM: number | null }> {
  return new Promise((resolve) => {
    const none = { latitude: null, longitude: null, accuracyM: null };
    if (!navigator.geolocation) return resolve(none);
    navigator.geolocation.getCurrentPosition((p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy }), () => resolve(none), { timeout: 8000 });
  });
}

/** Technician home: assigned work only. Every action is queued on the device first and synced when online. */
export function TechWork({ initial }: { initial: Work }) {
  const { t, locale } = useI18n();
  const { items, enqueue } = useOffline();
  const [cached, setCached] = useState<{ value: Work; savedAt: string } | null>(null);
  // The server copy wins whenever it has data; the device copy is only shown when the server copy is empty and we are offline.
  const useCached = cached !== null && !initial.tasks.length && !initial.projects.length;
  const work = useCached ? cached.value : initial;
  const fromCache = useCached ? cached.savedAt : null;
  const [message, setMessage] = useState<string | null>(null);

  // Keep the latest server copy on the device so the list is still available without a connection.
  useEffect(() => { if (initial.tasks.length || initial.projects.length) void cacheStore.set('work', initial); }, [initial]);
  useEffect(() => {
    if (initial.tasks.length || initial.projects.length) return;
    void cacheStore.get<Work>('work').then((saved) => { if (saved && !navigator.onLine) setCached({ value: saved.value, savedAt: saved.savedAt }); });
  }, [initial]);

  // Show queued-but-unsynced task changes immediately.
  const pendingStatus = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) if (i.type === 'TASK_STATUS' && i.status === 'PENDING') map.set(String(i.payload.taskId), String(i.payload.to));
    return map;
  }, [items]);

  async function act(type: Parameters<typeof enqueue>[0], payload: Record<string, unknown>, label: string) {
    await enqueue(type, payload, label);
    setMessage(navigator.onLine ? t('p.tech.saved') : t('err.OFFLINE'));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SyncBar />
      {fromCache && <p className="mb-3 text-xs text-amber-800">{t('p.tech.cachedCopy', { date: formatDate(fromCache, locale) })}</p>}
      {message && <p role="status" data-testid="tech-message" className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">{message}</p>}

      <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('p.tech.sites')}</h2>
      {work.projects.length === 0 ? <Card><EmptyState title={t('p.tech.noProjects')} /></Card> : (
        <ul className="space-y-3">{work.projects.map((p) => (
          <li key={p.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold">{p.project_name}<span className="block text-xs font-normal text-slate-500">{p.project_number} · {p.address}</span></p>
                <StatusBadge value={p.status} label={t(`e.projectStatus.${p.status}`)} />
              </div>
              {p.status === 'STOP_WORK' && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{t('m.stopWorkNote')}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" data-testid="check-in" onClick={async () => act('ATTENDANCE', { projectId: p.id, kind: 'CHECK_IN', ...(await position()) }, `${t('m.attendance.CHECK_IN')} · ${p.project_number}`)}><LogIn className="size-4" aria-hidden />{t('m.attendance.CHECK_IN')}</Button>
                <Button size="sm" variant="secondary" onClick={async () => act('ATTENDANCE', { projectId: p.id, kind: 'CHECK_OUT', ...(await position()) }, `${t('m.attendance.CHECK_OUT')} · ${p.project_number}`)}><LogOut className="size-4" aria-hidden />{t('m.attendance.CHECK_OUT')}</Button>
              </div>
              <details className="mt-3 rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium">{t('p.tech.safetyChecklist')}</summary>
                <form className="mt-3 space-y-2" onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget; const fd = new FormData(form);
                  const payload: Record<string, unknown> = { projectId: p.id, notes: String(fd.get('notes') ?? '') || null };
                  for (const c of CHECKS) payload[c] = fd.get(c) === 'on';
                  await act('CHECKLIST', payload, `${t('p.tech.safetyChecklist')} · ${p.project_number}`); form.reset();
                }}>
                  {CHECKS.map((c) => <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" name={c} className="size-4 accent-brand-600" />{t(`p.tech.check.${c}`)}</label>)}
                  <input name="notes" placeholder={t('common.notes')} aria-label={t('common.notes')} className={INPUT} />
                  <p className="text-xs text-slate-500">{t('p.tech.checklistNote')}</p>
                  <Button size="sm" type="submit" variant="secondary">{t('common.submit')}</Button>
                </form>
              </details>
              <details className="mt-2 rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium">{t('p.tech.materialUsage')}</summary>
                <form className="mt-3 grid grid-cols-[1fr_5rem_5rem] gap-2" onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget; const fd = new FormData(form);
                  const quantity = Number(fd.get('quantity')); const description = String(fd.get('description') ?? '').trim();
                  if (!description || !(quantity > 0)) return;
                  await act('MATERIAL_USAGE', { projectId: p.id, description, quantity, unit: String(fd.get('unit') || 'nos') }, `${t('p.tech.materialUsage')} · ${description}`); form.reset();
                }}>
                  <input name="description" required placeholder={t('f.description')} aria-label={t('f.description')} className={INPUT} />
                  <input name="quantity" required inputMode="decimal" placeholder={t('f.quantity')} aria-label={t('f.quantity')} className={INPUT} />
                  <input name="unit" defaultValue="nos" aria-label={t('f.unit')} className={INPUT} />
                  <div className="col-span-3"><Button size="sm" type="submit" variant="secondary">{t('common.add')}</Button></div>
                </form>
              </details>
            </Card>
          </li>
        ))}</ul>
      )}

      <h2 className="mt-6 mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('p.tech.tasks')}</h2>
      {work.tasks.length === 0 ? <Card><EmptyState title={t('p.tech.noTasks')} /></Card> : (
        <ul className="space-y-3">{work.tasks.map((k) => {
          const status = pendingStatus.get(k.id) ?? k.status;
          const queued = pendingStatus.has(k.id);
          const blocked = k.project_status === 'STOP_WORK';
          return (
            <li key={k.id}>
              <Card className="p-4" data-testid="task-card" data-status={status}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">{k.title}{k.safety_critical && <Badge tone="red" className="ml-2">{t('f.safetyCritical')}</Badge>}
                    <span className="block text-xs font-normal text-slate-500">{k.project_number} · {k.project_name}{k.due_date ? ` · ${formatDate(k.due_date, locale)}` : ''}</span></p>
                  <span className="flex gap-1"><StatusBadge value={status} label={t(`e.taskStatus.${status}`)} />{queued && <Badge tone="amber">{t('e.syncStatus.PENDING')}</Badge>}</span>
                </div>
                {k.description && <p className="mt-2 text-sm text-slate-700">{k.description}</p>}
                {k.review_note && <p className="mt-2 text-sm text-amber-800">{t('f.reviewNote')}: {k.review_note}</p>}
                {!blocked && ['TODO', 'IN_PROGRESS', 'REWORK'].includes(status) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {status !== 'IN_PROGRESS' && <Button size="sm" variant="secondary" data-testid="task-start" onClick={() => act('TASK_STATUS', { taskId: k.id, to: 'IN_PROGRESS' }, `${t('a.startTask')} · ${k.title}`)}>{t('a.startTask')}</Button>}
                    <Button size="sm" variant="success" data-testid="task-done" onClick={() => act('TASK_STATUS', { taskId: k.id, to: 'DONE_PENDING_REVIEW' }, `${t('a.markDone')} · ${k.title}`)}>{t('a.markDone')}</Button>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-sm font-medium text-slate-800">
                      <Camera className="size-4" aria-hidden />{t('a.addPhoto')}
                      <input type="file" accept="image/*" capture="environment" className="sr-only" data-testid="task-photo" onChange={async (e) => {
                        const file = e.target.files?.[0]; e.target.value = '';
                        if (!file) return;
                        await act('EVIDENCE', { projectId: k.project_id, taskId: k.id, caption: k.title, ...(await fileToUpload(file)) }, `${t('a.addPhoto')} · ${k.title}`);
                      }} />
                    </label>
                  </div>
                )}
                {status === 'DONE_PENDING_REVIEW' && <p className="mt-2 text-xs text-slate-500">{t('m.taskCompletionNote')}</p>}
              </Card>
            </li>
          );
        })}</ul>
      )}
    </div>
  );
}
