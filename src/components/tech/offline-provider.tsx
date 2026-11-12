'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { backoffMs, newQueueItem, queueStore, syncPending, type QueueItem } from '@/lib/offline-queue';

interface OfflineApi {
  items: QueueItem[];
  online: boolean;
  syncing: boolean;
  /** Stores the event on the device first, then tries to send it. Never loses an entry when offline. */
  enqueue: (type: QueueItem['type'], payload: Record<string, unknown>, label: string) => Promise<void>;
  syncNow: () => Promise<void>;
  retry: (id: string) => Promise<void>;
  clearSynced: () => Promise<void>;
}
const Ctx = createContext<OfflineApi | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => setItems(await queueStore.all()), []);

  const syncNow = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    setSyncing(true);
    try {
      const before = (await queueStore.all()).filter((i) => i.status === 'PENDING').length;
      const done = await syncPending();
      const all = await queueStore.all();
      setItems(all);
      if (before > 0) router.refresh();
      if (!done) {
        // Retry with backoff based on the most-attempted pending item.
        const attempts = Math.max(1, ...all.filter((i) => i.status === 'PENDING').map((i) => i.attempts));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { void syncNow(); }, backoffMs(attempts));
      }
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [router]);

  useEffect(() => {
    const goOnline = () => { setOnline(true); void syncNow(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Initial state is read after mount so server and client render the same markup.
    const start = setTimeout(() => { setOnline(navigator.onLine); void refresh().then(syncNow); }, 0);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearTimeout(start);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, syncNow]);

  const enqueue = useCallback(async (type: QueueItem['type'], payload: Record<string, unknown>, label: string) => {
    await queueStore.put(newQueueItem(type, payload, label));
    await refresh();
    void syncNow();
  }, [refresh, syncNow]);

  const retry = useCallback(async (id: string) => {
    const item = (await queueStore.all()).find((i) => i.clientEventId === id);
    if (item) await queueStore.put({ ...item, status: 'PENDING', error: undefined });
    await refresh();
    void syncNow();
  }, [refresh, syncNow]);

  const clearSynced = useCallback(async () => {
    for (const item of await queueStore.all()) if (item.status === 'SYNCED') await queueStore.remove(item.clientEventId);
    await refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ items, online, syncing, enqueue, syncNow, retry, clearSynced }}>{children}</Ctx.Provider>;
}

export function useOffline(): OfflineApi {
  const value = useContext(Ctx);
  if (!value) throw new Error('useOffline must be used inside OfflineProvider');
  return value;
}
