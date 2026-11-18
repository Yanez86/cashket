// SPDX-License-Identifier: AGPL-3.0-or-later
// Who should be reminded to do a session (docs/SPEC.md §5.2): the reminder is on, there is something to
// reconcile, the last session is older than the chosen interval, it is the chosen hour or later in the
// person's own time zone, and they were not reminded today.
import type { Sqlite } from '../db/core.ts';

export interface DueReminder {
  userId: number;
  queued: number;
  pending: number;
  localDay: string;
  /** Days since the last session; null before the first. */
  daysSince: number | null;
}

function localClock(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
  } catch {
    return localClock(now, 'Europe/Rome');
  }
}

export function dueReminders(db: Sqlite, now = new Date()): DueReminder[] {
  const users = db
    .prepare(
      `SELECT u.id, u.timezone, u.session_reminder_days, u.reminder_hour, u.last_session_at, u.last_reminded_on,
              (SELECT COUNT(*) FROM captures c WHERE c.user_id = u.id AND c.status = 'queued') AS queued,
              (SELECT COUNT(*) FROM transactions t WHERE t.user_id = u.id AND t.status = 'pending') AS pending
       FROM users u WHERE u.active = 1 AND u.session_reminder_days IS NOT NULL`
    )
    .all() as {
    id: number;
    timezone: string;
    session_reminder_days: number;
    reminder_hour: number;
    last_session_at: string | null;
    last_reminded_on: string | null;
    queued: number;
    pending: number;
  }[];
  const due: DueReminder[] = [];
  for (const u of users) {
    if (!u.queued && !u.pending) continue;
    const clock = localClock(now, u.timezone);
    if (clock.hour < u.reminder_hour || u.last_reminded_on === clock.day) continue;
    const daysSince = u.last_session_at ? Math.floor((now.getTime() - Date.parse(u.last_session_at)) / 864e5) : null;
    if (daysSince != null && daysSince < u.session_reminder_days) continue;
    due.push({ userId: u.id, queued: u.queued, pending: u.pending, localDay: clock.day, daysSince });
  }
  return due;
}

export const markReminded = (db: Sqlite, userId: number, localDay: string) =>
  void db.prepare('UPDATE users SET last_reminded_on = ? WHERE id = ?').run(localDay, userId);

/** "5 spese in coda · ultima sessione 8 giorni fa" */
export function reminderText(r: DueReminder): string {
  const parts: string[] = [];
  if (r.queued) parts.push(`${r.queued} ${r.queued === 1 ? 'spesa' : 'spese'} in coda`);
  if (r.pending) parts.push(`${r.pending} ${r.pending === 1 ? 'movimento' : 'movimenti'} da sistemare`);
  parts.push(r.daysSince == null ? 'nessuna sessione ancora' : `ultima sessione ${r.daysSince} giorni fa`);
  return parts.join(' · ');
}
