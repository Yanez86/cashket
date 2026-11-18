// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline capture, as Mealler's offline entries: an expense typed without a connection waits in a local list
// and is sent as soon as the network is back. Each carries a clientId, so the server saves it once however
// many times it arrives.
import type { CaptureInput, QueueSummary } from '@cashket/shared';
import { ApiError, get, post } from './api';

interface Pending {
  createdAt: string;
  body: CaptureInput & { clientId: string };
}

export const queue = $state({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  /** Expenses on the server, waiting for a session. */
  count: 0,
  totalCents: 0,
  /** Expenses on this device only, not sent yet. */
  pending: [] as Pending['body'][],
  /** Notes of expenses the server refused: shown, never dropped in silence. */
  rejected: [] as string[]
});

let userId: number | null = null;
const key = () => `cashket-queue-${userId ?? 'anon'}`;

function read(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(key()) ?? '[]') as Pending[];
  } catch {
    return [];
  }
}

/** False when the device could not keep the list (storage full or unavailable). */
function write(list: Pending[]): boolean {
  try {
    localStorage.setItem(key(), JSON.stringify(list));
  } catch {
    queue.pending = read().map((p) => p.body);
    return false;
  }
  queue.pending = list.map((p) => p.body);
  return true;
}

export function initOffline(currentUserId: number | null) {
  userId = currentUserId;
  queue.pending = read().map((p) => p.body);
}

export const newClientId = (): string =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Server count and total of the queue. */
export async function refreshQueue() {
  try {
    const s = await get<QueueSummary>('/captures/summary');
    queue.count = s.count;
    queue.totalCents = s.totalCents;
    // The number on the app's icon, where the phone supports it (installed PWA).
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (s.count) await nav.setAppBadge?.(s.count).catch(() => {});
    else await nav.clearAppBadge?.().catch(() => {});
  } catch {
    // Offline: keep the last known numbers.
  }
}

const retryLater = (e: unknown) =>
  e instanceof ApiError && (e.code === 'offline' || e.status === 0 || e.status >= 500 || e.status === 401 || e.status === 429);

/**
 * Sends an expense, or keeps it on the device when there is no connection.
 * Returns 'sent' or 'kept'; throws when the server refused it or the device could not keep it.
 */
export async function capture(body: CaptureInput): Promise<'sent' | 'kept'> {
  const withId = { ...body, clientId: body.clientId ?? newClientId() };
  try {
    await post('/captures', withId);
    await refreshQueue();
    return 'sent';
  } catch (e) {
    if (!retryLater(e)) throw e;
    if (!write([...read(), { createdAt: new Date().toISOString(), body: withId }])) throw new ApiError(0, 'storageFull');
    return 'kept';
  }
}

let flushing = false;

/** Sends the expenses kept on the device, in order. Returns how many were sent. */
export async function flushQueue(): Promise<number> {
  if (flushing || userId == null) return 0;
  flushing = true;
  let sent = 0;
  try {
    let list = read();
    while (list.length) {
      const [next] = list;
      try {
        await post('/captures', next.body);
        sent++;
      } catch (e) {
        if (retryLater(e)) break;
        queue.rejected.push(next.body.note ?? `${(next.body.amountCents / 100).toFixed(2)} €`);
      }
      list = list.slice(1);
      write(list);
    }
  } finally {
    flushing = false;
  }
  if (sent) await refreshQueue();
  return sent;
}

/** Removes cached API responses (on logout, so another account never sees them). */
export async function clearApiCache() {
  if (typeof caches === 'undefined') return;
  for (const name of await caches.keys()) if (name.startsWith('cashket-api')) await caches.delete(name);
}
