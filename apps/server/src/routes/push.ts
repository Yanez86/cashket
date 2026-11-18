// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import { HttpError } from '../http.ts';
import { pushToUser } from '../push.ts';

export async function pushRoutes(app: FastifyInstance, { sqlite: db, push }: AppContext) {
  const sender = () => {
    if (!push) throw new HttpError(503, 'pushOff');
    return push;
  };

  app.get('/key', async () => ({ publicKey: sender().publicKey }));

  app.post('/subscribe', async (request) => {
    const user = requireUser(request);
    const body = z
      .object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) })
      .parse(request.body);
    db.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
    ).run(user.id, body.endpoint, body.keys.p256dh, body.keys.auth, request.headers['user-agent']?.slice(0, 300) ?? null);
    return { ok: true };
  });

  app.post('/unsubscribe', async (request) => {
    const user = requireUser(request);
    const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(request.body);
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, user.id);
    return { ok: true };
  });

  app.post('/test', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request) => {
    const user = requireUser(request);
    const delivered = await pushToUser(db, sender(), user.id, { title: 'Cashket', body: 'Le notifiche funzionano.', url: '/profilo', tag: 'cashket-test' });
    return { delivered };
  });
}
