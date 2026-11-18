// SPDX-License-Identifier: AGPL-3.0-or-later
// Web Push, as in Mealler: VAPID keys made on first start and kept in settings; a device whose
// subscription the browser dropped is forgotten.
import webpush from 'web-push';
import type { Config } from './config.ts';
import type { Sqlite } from './db/core.ts';
import { getSetting, setSetting } from './services/settings.ts';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushSender {
  publicKey: string;
  send(target: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<'ok' | 'gone' | 'error'>;
}

export function vapidKeys(db: Sqlite) {
  const publicKey = getSetting(db, 'vapid_public');
  const privateKey = getSetting(db, 'vapid_private');
  if (publicKey && privateKey) return { publicKey, privateKey };
  const keys = webpush.generateVAPIDKeys();
  setSetting(db, 'vapid_public', keys.publicKey);
  setSetting(db, 'vapid_private', keys.privateKey);
  return keys;
}

export function createPushSender(db: Sqlite, config: Config): PushSender {
  const { publicKey, privateKey } = vapidKeys(db);
  const subject = () => {
    if (config.baseUrl?.startsWith('https://')) return config.baseUrl;
    // Push services want a contact: the first administrator's address.
    const admin = db.prepare("SELECT email FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get() as { email: string } | undefined;
    return `mailto:${admin?.email ?? 'admin@example.com'}`;
  };
  return {
    publicKey,
    async send(target, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          { vapidDetails: { subject: subject(), publicKey, privateKey }, TTL: 60 * 60 * 12 }
        );
        return 'ok';
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? 'gone' : 'error';
      }
    }
  };
}

/** Sends to every device of a person; returns how many accepted. */
export async function pushToUser(db: Sqlite, sender: PushSender, userId: number, payload: PushPayload): Promise<number> {
  const targets = db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId) as {
    id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  let delivered = 0;
  for (const t of targets) {
    const result = await sender.send(t, payload);
    if (result === 'ok') {
      delivered++;
      db.prepare('UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), t.id);
    } else if (result === 'gone') db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(t.id);
  }
  return delivered;
}
