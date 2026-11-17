// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadConfig } from './config.ts';
import { migrate, openDatabase } from './db/index.ts';
import { buildApp } from './app.ts';
import { createPasswordReset } from './services/access.ts';
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
const app = await buildApp({ sqlite, config });
if (applied.length) app.log.info({ applied }, 'database migrations applied');

const shutdown = async (signal: string) => {
  app.log.info(`received ${signal}, shutting down`);
  await app.close();
  sqlite.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(`Cashket ${config.version} listening on ${config.host}:${config.port}`);
