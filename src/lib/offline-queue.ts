// Offline queue for the technician app (spec 12.5). Events are stored in IndexedDB with a
// client-generated id, sent when a connection is available and acknowledged by the server.
// The server de-duplicates on that id, so retrying after a lost connection is always safe.

export type QueueStatus = 'PENDING' | 'SYNCED' | 'FAILED';
export interface QueueItem {
  clientEventId: string;
  type: 'ATTENDANCE' | 'TASK_STATUS' | 'CHECKLIST' | 'MATERIAL_USAGE' | 'EVIDENCE' | 'HAZARD';
  payload: Record<string, unknown>;
  /** Device capture time; the server records its own receipt time separately. */
  capturedAt: string;
  label: string;
  status: QueueStatus;
  attempts: number;
  error?: string;
  receivedAt?: string;
}

const DB_NAME = 'aiec-tech';
const STORES = ['queue', 'cache'] as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('queue', { keyPath: 'clientEventId' });
      request.result.createObjectStore('cache', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function run<T>(store: (typeof STORES)[number], mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = fn(db.transaction(store, mode).objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const queueStore = {
  all: async (): Promise<QueueItem[]> => (await run<QueueItem[]>('queue', 'readonly', (s) => s.getAll())).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
  put: (item: QueueItem) => run('queue', 'readwrite', (s) => s.put(item)),
  remove: (id: string) => run('queue', 'readwrite', (s) => s.delete(id)),
};
export const cacheStore = {
  get: async <T>(key: string): Promise<{ value: T; savedAt: string } | null> => (await run<{ key: string; value: T; savedAt: string } | undefined>('cache', 'readonly', (s) => s.get(key))) ?? null,
  set: <T>(key: string, value: T) => run('cache', 'readwrite', (s) => s.put({ key, value, savedAt: new Date().toISOString() })),
};

export function newQueueItem(type: QueueItem['type'], payload: Record<string, unknown>, label: string): QueueItem {
  return { clientEventId: crypto.randomUUID(), type, payload, capturedAt: new Date().toISOString(), label, status: 'PENDING', attempts: 0 };
}

/** Delay before the next automatic retry: 2s, 4s, 8s … capped at one minute. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempts - 1));
}

type Ack = { clientEventId: string; status: 'SYNCED' | 'DUPLICATE' | 'FAILED'; error?: string; receivedAt?: string };

/** Sends pending items one request at a time (photos can be large). Returns true when nothing is left pending. */
export async function syncPending(): Promise<boolean> {
  const pending = (await queueStore.all()).filter((i) => i.status === 'PENDING');
  for (const item of pending) {
    try {
      const response = await fetch('/api/tech/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [{ clientEventId: item.clientEventId, capturedAt: item.capturedAt, type: item.type, ...item.payload }] }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { ok: boolean; data?: { acks: Ack[] } };
      const ack = body.data?.acks[0];
      if (!ack) throw new Error('NO_ACK');
      // A duplicate means the server already has this event from an earlier attempt: that is success.
      if (ack.status === 'SYNCED' || ack.status === 'DUPLICATE') await queueStore.put({ ...item, status: 'SYNCED', receivedAt: ack.receivedAt ?? new Date().toISOString(), error: undefined });
      else await queueStore.put({ ...item, status: 'FAILED', attempts: item.attempts + 1, error: ack.error ?? 'UNKNOWN' });
    } catch (error) {
      // Network or server unavailable: keep the item pending and stop; a later retry will pick it up.
      await queueStore.put({ ...item, attempts: item.attempts + 1, error: error instanceof Error ? error.message : 'NETWORK' });
      return false;
    }
  }
  return true;
}

/** Downscales a photo to a JPEG of at most 1280px so it can be queued and uploaded on a weak connection. */
export async function fileToUpload(file: File): Promise<{ fileName: string; mimeType: string; dataBase64: string }> {
  const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  if (!file.type.startsWith('image/')) return { fileName: file.name, mimeType: file.type, dataBase64: await toBase64(file) };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ENCODE'))), 'image/jpeg', 0.72));
  return { fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', dataBase64: await toBase64(blob) };
}
