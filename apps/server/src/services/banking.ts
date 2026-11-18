// SPDX-License-Identifier: AGPL-3.0-or-later
// Automatic import through Enable Banking (docs/SPEC.md §7.5), in its free "restricted" mode: each person
// registers their own application on enablebanking.com, links their own accounts there, and gives Cashket
// the application id and private key. Downloaded lines go through the same pipeline as a CSV import.
import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import type { Aspsp, BankApp, BankConnection, ImportRow } from '@cashket/shared';
import type { Sqlite } from '../db/core.ts';
import { HttpError, badRequest, conflict, notFound } from '../errors.ts';
import type { SecretBox } from '../secrets.ts';
import { getAccount } from './accounts.ts';
import { importRows } from './imports.ts';

export const API = 'https://api.enablebanking.com';
const DAY = 864e5;
/** Italian banks give at most 180 days of consent (PSD2). */
const DEFAULT_CONSENT_DAYS = 180;
/** How far back the first download goes. */
const FIRST_DAYS = 90;

export type Fetch = typeof fetch;

export interface BankingDeps {
  db: Sqlite;
  box: SecretBox;
  /** Public https address of Cashket: the bank sends the person back there. */
  baseUrl: string | null;
  fetch?: Fetch;
  now?: () => number;
}

// ---------------------------------------------------------------- credentials and requests

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');

/** The JWT Enable Banking wants on every request: RS256, kid = application id, at most 24 hours. */
export function makeJwt(appId: string, privateKeyPem: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }));
  const body = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 }));
  const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), createPrivateKey(privateKeyPem));
  return `${head}.${body}.${b64url(signature)}`;
}

function credentials(deps: BankingDeps, userId: number) {
  const row = deps.db.prepare('SELECT app_id, private_key_enc FROM bank_apps WHERE user_id = ?').get(userId) as
    | { app_id: string; private_key_enc: string }
    | undefined;
  if (!row) throw conflict('bankAppMissing');
  return { appId: row.app_id, key: deps.box.decrypt(row.private_key_enc) };
}

async function call<T>(deps: BankingDeps, userId: number, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const { appId, key } = credentials(deps, userId);
  const res = await (deps.fetch ?? fetch)(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJwt(appId, key, (deps.now ?? Date.now)())}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000)
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { message?: string; error?: string; detail?: unknown };
      detail = j.message ?? j.error ?? (typeof j.detail === 'string' ? j.detail : detail);
    } catch {
      // not JSON
    }
    const error = new HttpError(502, 'bankError');
    error.message = `Enable Banking ${res.status}: ${detail}`;
    throw error;
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export function bankApp(deps: BankingDeps, userId: number): BankApp {
  const row = deps.db.prepare('SELECT app_id FROM bank_apps WHERE user_id = ?').get(userId) as { app_id: string } | undefined;
  return { configured: !!row, appId: row?.app_id ?? null, redirectUrl: `${deps.baseUrl ?? 'https://INDIRIZZO-DI-CASHKET'}/api/banking/callback` };
}

/** Stores the application id and its private key (PEM), encrypted. The key is checked before saving. */
export function saveBankApp(deps: BankingDeps, userId: number, appId: string, privateKeyPem: string): BankApp {
  try {
    const key = createPrivateKey(privateKeyPem);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not RSA');
  } catch {
    throw badRequest('bankKey');
  }
  deps.db
    .prepare(
      `INSERT INTO bank_apps (user_id, app_id, private_key_enc) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET app_id = excluded.app_id, private_key_enc = excluded.private_key_enc`
    )
    .run(userId, appId.trim(), deps.box.encrypt(privateKeyPem.trim()));
  return bankApp(deps, userId);
}

export function deleteBankApp(deps: BankingDeps, userId: number) {
  deps.db.prepare('DELETE FROM bank_apps WHERE user_id = ?').run(userId);
}

export async function listAspsps(deps: BankingDeps, userId: number, country: string): Promise<Aspsp[]> {
  const res = await call<{ aspsps: { name: string; country: string; logo?: string; maximum_consent_validity?: number }[] }>(
    deps,
    userId,
    'GET',
    `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`
  );
  return res.aspsps.map((a) => ({
    name: a.name,
    country: a.country,
    logo: a.logo ?? null,
    maxConsentDays: a.maximum_consent_validity ? Math.floor(a.maximum_consent_validity / 86400) : null
  }));
}

// ---------------------------------------------------------------- connections

interface ConnectionRow {
  id: number;
  user_id: number;
  aspsp_name: string;
  aspsp_country: string;
  session_id: string | null;
  state: string | null;
  status: BankConnection['status'];
  accounts: string;
  consent_expires_at: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
}

const toConnection = (r: ConnectionRow): BankConnection => ({
  id: r.id,
  aspspName: r.aspsp_name,
  aspspCountry: r.aspsp_country,
  status: r.status,
  consentExpiresAt: r.consent_expires_at,
  lastFetchedAt: r.last_fetched_at,
  lastError: r.last_error,
  accounts: JSON.parse(r.accounts || '[]') as BankConnection['accounts']
});

export const listConnections = (db: Sqlite, userId: number) =>
  (db.prepare("SELECT * FROM bank_connections WHERE user_id = ? AND provider = 'enablebanking' AND status <> 'pending' ORDER BY id").all(userId) as ConnectionRow[]).map(
    toConnection
  );

function ownConnection(db: Sqlite, userId: number, id: number): ConnectionRow {
  const row = db.prepare('SELECT * FROM bank_connections WHERE id = ? AND user_id = ?').get(id, userId) as ConnectionRow | undefined;
  if (!row) throw notFound();
  return row;
}

/** Starts linking a bank: returns the bank's page where the person confirms (SCA). */
export async function startAuth(deps: BankingDeps, userId: number, aspsp: { name: string; country: string; maxConsentDays: number | null }) {
  if (!deps.baseUrl?.startsWith('https://')) throw conflict('baseUrlMissing');
  const now = (deps.now ?? Date.now)();
  const days = Math.min(aspsp.maxConsentDays ?? DEFAULT_CONSENT_DAYS, DEFAULT_CONSENT_DAYS);
  const state = randomBytes(18).toString('base64url');
  // Unfinished attempts are cleared, so pending rows never pile up.
  deps.db.prepare("DELETE FROM bank_connections WHERE user_id = ? AND status = 'pending'").run(userId);
  deps.db
    .prepare("INSERT INTO bank_connections (user_id, provider, aspsp_name, aspsp_country, state, status) VALUES (?, 'enablebanking', ?, ?, ?, 'pending')")
    .run(userId, aspsp.name, aspsp.country, state);
  const res = await call<{ url: string }>(deps, userId, 'POST', '/auth', {
    access: { valid_until: new Date(now + days * DAY).toISOString() },
    aspsp: { name: aspsp.name, country: aspsp.country },
    state,
    redirect_url: `${deps.baseUrl}/api/banking/callback`,
    psu_type: 'personal'
  });
  return { url: res.url };
}

interface SessionAccount {
  uid?: string;
  account_id?: { iban?: string; other?: { identification?: string } };
  name?: string;
  details?: string;
  product?: string;
  currency?: string;
}

/**
 * The person is back from the bank: the code becomes a session. A connection to the same bank made before
 * is replaced (that is how consent is renewed) and keeps its account choices.
 */
export async function finishAuth(deps: BankingDeps, userId: number, state: string, code: string): Promise<BankConnection> {
  const pending = deps.db
    .prepare("SELECT * FROM bank_connections WHERE user_id = ? AND state = ? AND status = 'pending'")
    .get(userId, state) as ConnectionRow | undefined;
  if (!pending) throw badRequest('bankState');
  const session = await call<{ session_id: string; accounts: (SessionAccount | string)[]; access?: { valid_until?: string } }>(deps, userId, 'POST', '/sessions', {
    code
  });
  const previous = deps.db
    .prepare("SELECT * FROM bank_connections WHERE user_id = ? AND aspsp_name = ? AND aspsp_country = ? AND status <> 'pending' AND id <> ?")
    .get(userId, pending.aspsp_name, pending.aspsp_country, pending.id) as ConnectionRow | undefined;
  const before = previous ? toConnection(previous).accounts : [];
  const accounts = session.accounts.map((a) => {
    const acc: SessionAccount = typeof a === 'string' ? { uid: a } : a;
    const iban = acc.account_id?.iban ?? null;
    const old = before.find((b) => (iban && b.iban === iban) || b.uid === acc.uid);
    return {
      uid: acc.uid ?? '',
      name: acc.name ?? acc.product ?? acc.details ?? iban ?? 'Conto',
      iban,
      accountId: old?.accountId ?? null
    };
  });
  deps.db.transaction(() => {
    deps.db
      .prepare("UPDATE bank_connections SET session_id = ?, status = 'active', state = NULL, accounts = ?, consent_expires_at = ?, last_error = NULL, expiry_warned_at = NULL WHERE id = ?")
      .run(session.session_id, JSON.stringify(accounts), session.access?.valid_until ?? null, pending.id);
    if (previous) {
      deps.db.prepare('UPDATE bank_connections SET last_fetched_at = ? WHERE id = ?').run(previous.last_fetched_at, pending.id);
      deps.db.prepare('UPDATE import_batches SET connection_id = ? WHERE connection_id = ?').run(pending.id, previous.id);
      deps.db.prepare('DELETE FROM bank_connections WHERE id = ?').run(previous.id);
    }
  });
  return toConnection(ownConnection(deps.db, userId, pending.id));
}

/** Chooses which Cashket account a bank account feeds (null: not imported). */
export function mapAccount(db: Sqlite, userId: number, id: number, uid: string, accountId: number | null): BankConnection {
  const row = ownConnection(db, userId, id);
  if (accountId != null) getAccount(db, userId, accountId);
  const accounts = toConnection(row).accounts;
  const target = accounts.find((a) => a.uid === uid);
  if (!target) throw notFound();
  target.accountId = accountId;
  db.prepare('UPDATE bank_connections SET accounts = ? WHERE id = ?').run(JSON.stringify(accounts), id);
  return toConnection(ownConnection(db, userId, id));
}

export async function deleteConnection(deps: BankingDeps, userId: number, id: number) {
  const row = ownConnection(deps.db, userId, id);
  if (row.session_id) await call(deps, userId, 'DELETE', `/sessions/${row.session_id}`).catch(() => {});
  deps.db.prepare('UPDATE import_batches SET connection_id = NULL WHERE connection_id = ?').run(id);
  deps.db.prepare('DELETE FROM bank_connections WHERE id = ?').run(id);
}

// ---------------------------------------------------------------- downloading

/** One Enable Banking transaction (only the fields Cashket reads). */
export interface BankTransaction {
  transaction_amount: { amount: string; currency?: string };
  credit_debit_indicator?: 'CRDT' | 'DBIT';
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  entry_reference?: string | null;
  transaction_id?: string | null;
  status?: string;
}

/** A bank transaction as an import row: expenses negative, the counterparty first in the description. */
export function toImportRow(t: BankTransaction): ImportRow | null {
  const amount = Math.round(Math.abs(Number(t.transaction_amount?.amount)) * 100);
  const date = t.booking_date ?? t.value_date ?? t.transaction_date;
  if (!amount || !date) return null;
  const debit = t.credit_debit_indicator ? t.credit_debit_indicator === 'DBIT' : Number(t.transaction_amount.amount) < 0;
  const counterparty = (debit ? t.creditor?.name : t.debtor?.name) ?? '';
  const description = [counterparty, ...(t.remittance_information ?? [])]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 500);
  return {
    date: date.slice(0, 10),
    valueDate: t.value_date ? t.value_date.slice(0, 10) : null,
    amountCents: debit ? -amount : amount,
    description: description || 'Movimento',
    externalId: (t.entry_reference || t.transaction_id || null)?.slice(0, 100) ?? null
  };
}

/**
 * Downloads booked lines of every mapped account since the last download (five days back, as banks book
 * late; the first time three months) and imports them. Doubles are skipped by the import.
 */
export async function syncConnection(deps: BankingDeps, userId: number, id: number): Promise<{ added: number }> {
  const row = ownConnection(deps.db, userId, id);
  if (row.status !== 'active' || !row.session_id) throw conflict('bankNotActive');
  const now = (deps.now ?? Date.now)();
  if (row.consent_expires_at && Date.parse(row.consent_expires_at) < now) {
    deps.db.prepare("UPDATE bank_connections SET status = 'expired' WHERE id = ?").run(id);
    throw conflict('bankExpired');
  }
  const from = new Date(row.last_fetched_at ? Date.parse(row.last_fetched_at) - 5 * DAY : now - FIRST_DAYS * DAY).toISOString().slice(0, 10);
  let added = 0;
  try {
    for (const account of toConnection(row).accounts) {
      if (account.accountId == null || !account.uid) continue;
      const rows: ImportRow[] = [];
      let key: string | null = null;
      for (let page = 0; page < 100; page++) {
        const query = new URLSearchParams({ date_from: from, transaction_status: 'BOOK' });
        if (key) query.set('continuation_key', key);
        const res = await call<{ transactions: BankTransaction[]; continuation_key?: string | null }>(
          deps,
          userId,
          'GET',
          `/accounts/${encodeURIComponent(account.uid)}/transactions?${query}`
        );
        for (const t of res.transactions ?? []) {
          if (t.status && t.status !== 'BOOK') continue;
          const r = toImportRow(t);
          if (r) rows.push(r);
        }
        key = res.continuation_key ?? null;
        if (!key) break;
      }
      if (!rows.length) continue;
      const batch = importRows(deps.db, userId, {
        accountId: account.accountId,
        fileName: `${row.aspsp_name} · ${account.name}`,
        fileSha256: null,
        rows,
        profile: null,
        connectionId: id
      });
      // A download that brought nothing new leaves no trace in the import list.
      if (!batch.rowsNew) deps.db.prepare('DELETE FROM import_batches WHERE id = ?').run(batch.id);
      added += batch.rowsNew;
    }
    deps.db.prepare('UPDATE bank_connections SET last_fetched_at = ?, last_error = NULL WHERE id = ?').run(new Date(now).toISOString(), id);
  } catch (error) {
    deps.db.prepare('UPDATE bank_connections SET last_error = ? WHERE id = ?').run(String((error as Error).message).slice(0, 300), id);
    throw error;
  }
  return { added };
}

/** Every active connection of everyone, for the scheduled download. Errors are kept on each connection. */
export async function syncAll(deps: BankingDeps): Promise<number> {
  const rows = deps.db.prepare("SELECT id, user_id FROM bank_connections WHERE provider = 'enablebanking' AND status = 'active'").all() as {
    id: number;
    user_id: number;
  }[];
  let added = 0;
  for (const r of rows) {
    try {
      added += (await syncConnection(deps, r.user_id, r.id)).added;
    } catch {
      // Recorded in last_error, shown in Connessioni.
    }
  }
  return added;
}

/** Connections whose consent ends within a week and were not warned yet. */
export function expiringConnections(db: Sqlite, now = Date.now()) {
  const limit = new Date(now + 7 * DAY).toISOString();
  return db
    .prepare(
      "SELECT id, user_id, aspsp_name, consent_expires_at FROM bank_connections WHERE status = 'active' AND consent_expires_at IS NOT NULL AND consent_expires_at < ? AND expiry_warned_at IS NULL"
    )
    .all(limit) as { id: number; user_id: number; aspsp_name: string; consent_expires_at: string }[];
}

export const markExpiryWarned = (db: Sqlite, id: number) =>
  void db.prepare('UPDATE bank_connections SET expiry_warned_at = ? WHERE id = ?').run(new Date().toISOString(), id);

