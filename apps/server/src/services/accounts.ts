// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Account, AccountKind } from '@cashket/shared';
import { insertedId, type Sqlite } from '../db/core.ts';
import { badRequest, notFound } from '../errors.ts';

interface AccountRow {
  id: number;
  user_id: number;
  name: string;
  kind: AccountKind;
  settles_to_account_id: number | null;
  position: number;
  archived: number;
}

const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  settlesToAccountId: r.settles_to_account_id,
  position: r.position,
  archived: !!r.archived
});

export const listAccounts = (db: Sqlite, userId: number) =>
  (db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY archived, position, id').all(userId) as AccountRow[]).map(toAccount);

function ownAccount(db: Sqlite, userId: number, id: number): AccountRow {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, userId) as AccountRow | undefined;
  if (!row) throw notFound();
  return row;
}

export const getAccount = (db: Sqlite, userId: number, id: number) => toAccount(ownAccount(db, userId, id));

export interface AccountInput {
  name: string;
  kind: AccountKind;
  settlesToAccountId: number | null;
}

/** A card's statement is charged to one of the person's other, non-card accounts. */
function checkSettlement(db: Sqlite, userId: number, kind: AccountKind, settlesTo: number | null, selfId?: number) {
  if (settlesTo == null) return;
  if (kind !== 'card' || settlesTo === selfId) throw badRequest('settlement');
  if (ownAccount(db, userId, settlesTo).kind === 'card') throw badRequest('settlement');
}

export function createAccount(db: Sqlite, userId: number, input: AccountInput): Account {
  checkSettlement(db, userId, input.kind, input.settlesToAccountId);
  const position = (db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS p FROM accounts WHERE user_id = ?').get(userId) as { p: number }).p;
  const id = insertedId(
    db
      .prepare('INSERT INTO accounts (user_id, name, kind, settles_to_account_id, position) VALUES (?, ?, ?, ?, ?)')
      .run(userId, input.name, input.kind, input.settlesToAccountId, position)
  );
  return getAccount(db, userId, id);
}

export function updateAccount(db: Sqlite, userId: number, id: number, patch: Partial<AccountInput & { archived: boolean; position: number }>): Account {
  const current = ownAccount(db, userId, id);
  const kind = patch.kind ?? current.kind;
  const settlesTo = patch.settlesToAccountId !== undefined ? patch.settlesToAccountId : kind === 'card' ? current.settles_to_account_id : null;
  checkSettlement(db, userId, kind, settlesTo, id);
  db.prepare('UPDATE accounts SET name = ?, kind = ?, settles_to_account_id = ?, archived = ?, position = ? WHERE id = ?').run(
    patch.name ?? current.name,
    kind,
    settlesTo,
    patch.archived === undefined ? current.archived : patch.archived ? 1 : 0,
    patch.position ?? current.position,
    id
  );
  return getAccount(db, userId, id);
}
