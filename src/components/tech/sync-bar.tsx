'use client';

import Link from 'next/link';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { useT } from '@/i18n/client';
import { useOffline } from './offline-provider';

export function SyncBar() {
  const t = useT();
  const { items, online, syncing, syncNow } = useOffline();
  const pending = items.filter((i) => i.status === 'PENDING').length;
  const failed = items.filter((i) => i.status === 'FAILED').length;
  return (
    <div data-testid="sync-bar" data-online={online} data-pending={pending}
      className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${online ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
      <span className="flex items-center gap-2 font-medium">
        {online ? <Wifi className="size-4" aria-hidden /> : <CloudOff className="size-4" aria-hidden />}
        {online ? t('p.tech.online') : t('p.tech.offline')}
      </span>
      <span className="flex items-center gap-3">
        <Link href="/tech/sync" className="underline">{t('p.tech.queueSummary', { pending, failed })}</Link>
        <button type="button" onClick={() => void syncNow()} disabled={!online || syncing} className="inline-flex items-center gap-1 rounded-lg border border-current px-2 py-1 text-xs font-semibold disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden />{t('a.syncNow')}
        </button>
      </span>
    </div>
  );
}
