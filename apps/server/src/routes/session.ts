// SPDX-License-Identifier: AGPL-3.0-or-later
// Imports and the reconciliation session (docs/SPEC.md §5.3, §7).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import { importRows, listBatches, listProfiles, undoBatch } from '../services/imports.ts';
import { assignLine, closeSession, confirmMatch, prepareSession, rejectMatch, sessionView, setLineKind } from '../services/session.ts';
import { zDate, zId } from '../validation.ts';

const col = z.number().int().min(0).max(200);
const zMapping = z.object({
  delimiter: z.enum([';', ',', '\t', '|']),
  headerRow: z.number().int().min(0).max(100),
  dateColumn: col,
  dateFormat: z.enum(['dd/mm/yyyy', 'yyyy-mm-dd', 'mm/dd/yyyy']),
  valueDateColumn: col.nullable(),
  descriptionColumns: z.array(col).min(1).max(5),
  amount: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('single'), column: col, invert: z.boolean() }),
    z.object({ mode: z.literal('split'), debitColumn: col, creditColumn: col })
  ]),
  idColumn: col.nullable()
});

const zRow = z.object({
  date: zDate,
  valueDate: zDate.nullable(),
  amountCents: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine((n) => n !== 0),
  description: z.string().trim().min(1).max(500),
  externalId: z.string().max(100).nullable()
});

export async function sessionRoutes(app: FastifyInstance, { sqlite: db }: AppContext) {
  app.get('/imports', async (request) => listBatches(db, requireUser(request).id, 20));

  app.get('/imports/profiles', async (request) => listProfiles(db, requireUser(request).id));

  // Rows come already read by the app (the same code reads them for the preview): a year of a busy
  // account fits well within the limit.
  app.post('/imports', { bodyLimit: 8 * 1024 * 1024 }, async (request) => {
    const user = requireUser(request);
    const body = z
      .object({
        accountId: zId,
        fileName: z.string().max(200).nullable(),
        fileSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
        rows: z.array(zRow).min(1).max(20000),
        profile: z.object({ headerFingerprint: z.string().max(2000), mapping: zMapping }).nullable()
      })
      .parse(request.body);
    return importRows(db, user.id, body);
  });

  app.post('/imports/:id/undo', async (request) => {
    const user = requireUser(request);
    undoBatch(db, user.id, z.object({ id: zId }).parse(request.params).id);
    return listBatches(db, user.id, 20);
  });

  app.get('/session', async (request) => sessionView(db, requireUser(request)));

  app.post('/session/prepare', async (request) => prepareSession(db, requireUser(request)));

  const pair = z.object({ captureId: zId, lineId: zId });
  app.post('/session/matches', async (request) => {
    const body = pair.parse(request.body);
    return confirmMatch(db, requireUser(request), body.captureId, body.lineId);
  });
  app.post('/session/rejections', async (request) => {
    const body = pair.parse(request.body);
    return rejectMatch(db, requireUser(request), body.captureId, body.lineId);
  });

  const lineParams = z.object({ id: zId });
  app.post('/session/lines/:id/assign', async (request) => {
    const { id } = lineParams.parse(request.params);
    const body = z.object({ bucketId: zId, remember: z.boolean().default(false) }).parse(request.body);
    return assignLine(db, requireUser(request), id, body.bucketId, body.remember);
  });
  app.post('/session/lines/:id/kind', async (request) => {
    const { id } = lineParams.parse(request.params);
    const body = z
      .object({ kind: z.enum(['expense', 'income', 'transfer']), budgetBase: z.boolean().default(false), remember: z.boolean().default(false) })
      .parse(request.body);
    return setLineKind(db, requireUser(request), id, body.kind, body.budgetBase, body.remember);
  });

  app.post('/session/close', async (request) => {
    const user = requireUser(request);
    closeSession(db, user);
    return sessionView(db, user);
  });
}
