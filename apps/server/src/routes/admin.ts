// SPDX-License-Identifier: AGPL-3.0-or-later
// The administrator manages who is in the household. They never see anyone else's money.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { requireAdmin } from '../auth.ts';
import { badRequest, notFound } from '../http.ts';
import { createInvite, createPasswordReset, deleteInvite, deleteSessions, listInvites } from '../services/access.ts';
import { countActiveAdmins, findUser, toUser, type UserRow } from '../services/users.ts';
import { zEmail, zId } from '../validation.ts';

export async function adminRoutes(app: FastifyInstance, { sqlite: db, config }: AppContext) {
  app.addHook('preHandler', async (request) => {
    requireAdmin(request);
  });

  const origin = (request: FastifyRequest) => config.baseUrl ?? `${request.protocol}://${request.host}`;

  app.get('/users', async () => (db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all() as UserRow[]).map(toUser));

  app.patch('/users/:id', async (request) => {
    const me = requireAdmin(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const body = z.object({ active: z.boolean(), role: z.enum(['admin', 'member']) }).partial().parse(request.body);
    const target = findUser(db, id);
    if (!target) throw notFound();
    const losesAdmin = target.role === 'admin' && !!target.active && (body.active === false || body.role === 'member');
    if (losesAdmin && countActiveAdmins(db) <= 1) throw badRequest('lastAdmin');
    if (target.id === me.id && body.active === false) throw badRequest('lastAdmin');
    if (body.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id);
    if (body.active !== undefined) db.prepare('UPDATE users SET active = ? WHERE id = ?').run(body.active ? 1 : 0, id);
    if (body.active === false) deleteSessions(db, id);
    return toUser(findUser(db, id)!);
  });

  // A forgotten password: the administrator hands over a one-time link and never learns the new password.
  app.post('/users/:id/reset', async (request) => {
    const { id } = z.object({ id: zId }).parse(request.params);
    if (!findUser(db, id)) throw notFound();
    return { url: `${origin(request)}/reset?token=${createPasswordReset(db, id)}` };
  });

  app.get('/invites', async (request) => listInvites(db, origin(request)));

  app.post('/invites', async (request) => {
    const me = requireAdmin(request);
    const body = z.object({ email: zEmail.nullable().default(null) }).parse(request.body ?? {});
    const token = createInvite(db, me.id, body.email);
    return listInvites(db, origin(request)).find((i) => i.token === token);
  });

  app.delete('/invites/:token', async (request) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(request.params);
    deleteInvite(db, token);
    return { ok: true };
  });
}
