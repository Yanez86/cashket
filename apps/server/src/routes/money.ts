// SPDX-License-Identifier: AGPL-3.0-or-later
// Accounts, buckets, income and the monthly budget of the signed-in person.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import { createAccount, listAccounts, updateAccount } from '../services/accounts.ts';
import { createBucket, getBucket, listBuckets, reorderBuckets, setArchived, updateBucket } from '../services/buckets.ts';
import { addIncome, deleteIncome, listIncomes } from '../services/incomes.ts';
import { createCapture, deleteCapture, listQueue, queueSummary, updateCapture } from '../services/captures.ts';
import { trends } from '../services/trends.ts';
import { allocate, budgetView, closePeriod, moveBetween, reopenPeriod } from '../services/budget.ts';
import { zBucketInput, zCents, zDate, zId, zMonth, zName } from '../validation.ts';

const zAccountKind = z.enum(['checking', 'card', 'paypal', 'cash']);
const params = z.object({ id: zId });
const monthParams = z.object({ month: zMonth });

export async function moneyRoutes(app: FastifyInstance, { sqlite: db }: AppContext) {
  // ---------------------------------------------------------------- accounts
  app.get('/accounts', async (request) => listAccounts(db, requireUser(request).id));

  app.post('/accounts', async (request) => {
    const user = requireUser(request);
    const body = z.object({ name: zName, kind: zAccountKind, settlesToAccountId: zId.nullable().default(null) }).parse(request.body);
    return createAccount(db, user.id, body);
  });

  app.patch('/accounts/:id', async (request) => {
    const user = requireUser(request);
    const { id } = params.parse(request.params);
    const body = z
      .object({ name: zName, kind: zAccountKind, settlesToAccountId: zId.nullable(), archived: z.boolean(), position: z.number().int().min(0) })
      .partial()
      .parse(request.body);
    return updateAccount(db, user.id, id, body);
  });

  // ---------------------------------------------------------------- buckets
  app.get('/buckets', async (request) => listBuckets(db, requireUser(request).id));

  app.get('/buckets/:id', async (request) => getBucket(db, requireUser(request).id, params.parse(request.params).id));

  app.post('/buckets', async (request) => createBucket(db, requireUser(request).id, zBucketInput.parse(request.body)));

  app.put('/buckets/:id', async (request) => {
    const user = requireUser(request);
    return updateBucket(db, user.id, params.parse(request.params).id, zBucketInput.parse(request.body));
  });

  app.post('/buckets/:id/archive', async (request) => {
    const user = requireUser(request);
    const { archived } = z.object({ archived: z.boolean() }).parse(request.body);
    return setArchived(db, user.id, params.parse(request.params).id, archived);
  });

  app.put('/buckets/order', async (request) => {
    const user = requireUser(request);
    const { ids } = z.object({ ids: z.array(zId).max(500) }).parse(request.body);
    reorderBuckets(db, user.id, ids);
    return listBuckets(db, user.id);
  });

  // ---------------------------------------------------------------- income typed by hand
  app.get('/incomes', async (request) => {
    const user = requireUser(request);
    const { month } = z.object({ month: zMonth }).parse(request.query);
    return listIncomes(db, user.id, month);
  });

  app.post('/incomes', async (request) => {
    const user = requireUser(request);
    const body = z
      .object({
        accountId: zId,
        date: zDate,
        amountCents: zCents.min(1),
        description: z.string().trim().min(1).max(200),
        budgetBase: z.boolean().default(true)
      })
      .parse(request.body);
    return addIncome(db, user.id, body);
  });

  app.delete('/incomes/:id', async (request) => {
    deleteIncome(db, requireUser(request).id, params.parse(request.params).id);
    return { ok: true };
  });

  // ---------------------------------------------------------------- the capture queue
  const zSpentAt = z.string().datetime({ offset: true }).max(40);
  const zNote = z.string().trim().max(200).nullable().transform((v) => v || null);

  app.get('/captures', async (request) => listQueue(db, requireUser(request).id));

  app.get('/captures/summary', async (request) => queueSummary(db, requireUser(request).id));

  app.post('/captures', async (request) => {
    const user = requireUser(request);
    const body = z
      .object({
        amountCents: zCents.min(1),
        spentAt: zSpentAt,
        accountId: zId.nullable().default(null),
        note: zNote.default(null),
        clientId: z.string().min(8).max(64).nullable().default(null)
      })
      .parse(request.body);
    return createCapture(db, user.id, body);
  });

  app.patch('/captures/:id', async (request) => {
    const user = requireUser(request);
    const body = z.object({ amountCents: zCents.min(1), spentAt: zSpentAt, accountId: zId.nullable(), note: zNote }).partial().parse(request.body);
    return updateCapture(db, user.id, params.parse(request.params).id, body);
  });

  app.delete('/captures/:id', async (request) => {
    deleteCapture(db, requireUser(request).id, params.parse(request.params).id);
    return { ok: true };
  });

  // ---------------------------------------------------------------- the month
  app.get('/budget/:month', async (request) => budgetView(db, requireUser(request), monthParams.parse(request.params).month));

  app.post('/budget/:month/allocate', async (request) => allocate(db, requireUser(request), monthParams.parse(request.params).month));

  app.post('/budget/:month/move', async (request) => {
    const user = requireUser(request);
    const { month } = monthParams.parse(request.params);
    const body = z
      .object({ fromBucketId: zId, toBucketId: zId, amountCents: zCents.min(1), note: z.string().trim().max(200).nullable().default(null) })
      .parse(request.body);
    return moveBetween(db, user, month, body.fromBucketId, body.toBucketId, body.amountCents, body.note);
  });

  app.post('/budget/:month/close', async (request) => closePeriod(db, requireUser(request), monthParams.parse(request.params).month));

  app.get('/trends', async (request) => {
    const q = z.object({ to: zMonth, months: z.coerce.number().int().min(2).max(24).default(6) }).parse(request.query);
    return trends(db, requireUser(request).id, q.to, q.months);
  });

  app.post('/budget/:month/reopen', async (request) => reopenPeriod(db, requireUser(request), monthParams.parse(request.params).month));
}
