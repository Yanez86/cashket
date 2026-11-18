// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadConfig } from './config.ts';
import { migrate, openDatabase } from './db/index.ts';
import { buildApp } from './app.ts';
import { createPasswordReset } from './services/access.ts';
import { createPushSender, pushToUser } from './push.ts';
import { dueReminders, markReminded, reminderText } from './services/reminders.ts';
import { findUserByEmail } from './services/users.ts';

const config = loadConfig();
const sqlite = openDatabase(config.dataDir);
const applied = migrate(sqlite, config.migrationsDir);

// When nobody can sign in as administrator any more:
//   docker exec cashket node dist/index.js reset-password nome@esempio.it
// prints a one-time link to set a new password.
if (process.argv[2] === 'reset-password') {
  const user = findUserByEmail(sqlite, process.argv[3] ?? '');
  if (!user) {
    console.error('Nessun account con questo indirizzo email.');
    process.exit(1);
  }
  console.log(`Link per scegliere una nuova password, valido 24 ore:\n${config.baseUrl ?? 'http://INDIRIZZO-DI-CASHKET'}/reset?token=${createPasswordReset(sqlite, user.id)}`);
  process.exit(0);
}
const push = createPushSender(sqlite, config);
const app = await buildApp({ sqlite, config, push });
if (applied.length) app.log.info({ applied }, 'database migrations applied');

// Session reminders (docs/SPEC.md §5.2): every quarter of an hour, who is due gets one notification a day.
async function remind() {
  for (const due of dueReminders(sqlite)) {
    try {
      await pushToUser(sqlite, push, due.userId, { title: 'È ora di una sessione', body: reminderText(due), url: '/coda', tag: 'cashket-session' });
    } catch (error) {
      app.log.warn({ error, userId: due.userId }, 'session reminder failed');
    }
    markReminded(sqlite, due.userId, due.localDay);
  }
}
const reminderTimer = setInterval(() => void remind(), 15 * 60_000);
reminderTimer.unref();

const shutdown = async (signal: string) => {
  app.log.info(`received ${signal}, shutting down`);
  clearInterval(reminderTimer);
  await app.close();
  sqlite.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(`Cashket ${config.version} listening on ${config.host}:${config.port}`);
