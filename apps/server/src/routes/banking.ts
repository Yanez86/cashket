// SPDX-License-Identifier: AGPL-3.0-or-later
// Bank connections through Enable Banking (docs/SPEC.md §7.5).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import {
  bankApp,
  deleteBankApp,
  deleteConnection,
  finishAuth,
  listAspsps,
  listConnections,
  mapAccount,
  saveBankApp,
  startAuth,
  syncConnection,
  type BankingDeps
} from '../services/banking.ts';
import { zId } from '../validation.ts';

export async function bankingRoutes(app: FastifyInstance, { sqlite: db, config, box }: AppContext) {
  const deps: BankingDeps = { db, box, baseUrl: config.baseUrl };

  app.get('/app', async (request) => bankApp(deps, requireUser(request).id));

  app.put('/app', async (request) => {
    const body = z.object({ appId: z.string().trim().min(8).max(100), privateKey: z.string().min(100).max(20000) }).parse(request.body);
    return saveBankApp(deps, requireUser(request).id, body.appId, body.privateKey);
  });

  app.delete('/app', async (request) => {
    deleteBankApp(deps, requireUser(request).id);
    return { ok: true };
  });

  app.get('/aspsps', async (request) => {
    const { country } = z.object({ country: z.string().regex(/^[A-Z]{2}$/).default('IT') }).parse(request.query);
    return listAspsps(deps, requireUser(request).id, country);
  });

  app.get('/connections', async (request) => listConnections(db, requireUser(request).id));

  app.post('/connections', async (request) => {
    const body = z
      .object({ name: z.string().min(1).max(200), country: z.string().regex(/^[A-Z]{2}$/), maxConsentDays: z.number().int().positive().nullable().default(null) })
      .parse(request.body);
    return startAuth(deps, requireUser(request).id, body);
  });

  // The bank sends the browser back here after the confirmation; the session cookie travels with it.
  app.get('/callback', async (request, reply) => {
    const q = z.object({ code: z.string().max(500).optional(), state: z.string().max(100).optional(), error: z.string().max(200).optional() }).parse(request.query);
    const back = (result: string) => reply.redirect(`/profilo/connessioni?esito=${encodeURIComponent(result)}`);
    if (!request.user) return reply.redirect('/login?next=/profilo/connessioni');
    if (q.error || !q.code || !q.state) return back(q.error ? 'annullato' : 'errore');
    try {
      await finishAuth(deps, request.user.id, q.state, q.code);
      return back('collegato');
    } catch (error) {
      request.log.warn({ error }, 'bank link failed');
      return back('errore');
    }
  });

  const params = z.object({ id: zId });

  app.patch('/connections/:id/accounts', async (request) => {
    const body = z.object({ uid: z.string().min(1).max(200), accountId: zId.nullable() }).parse(request.body);
    return mapAccount(db, requireUser(request).id, params.parse(request.params).id, body.uid, body.accountId);
  });

  app.post('/connections/:id/sync', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request) =>
    syncConnection(deps, requireUser(request).id, params.parse(request.params).id)
  );

  app.delete('/connections/:id', async (request) => {
    await deleteConnection(deps, requireUser(request).id, params.parse(request.params).id);
    return { ok: true };
  });
}
