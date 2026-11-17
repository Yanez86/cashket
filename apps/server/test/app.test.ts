// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.ts';
import { migrate, openDatabase } from '../src/db/index.ts';
import { buildApp } from '../src/app.ts';

const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

async function setup() {
  const sqlite = openDatabase('', ':memory:');
  migrate(sqlite, migrationsDir);
  const config = { ...loadConfig({}), publicDir: '/nonexistent' };
  return buildApp({ sqlite, config }, { logger: false });
}

test('health and status answer before setup', async () => {
  const app = await setup();
  assert.equal((await app.inject('/healthz')).statusCode, 200);
  const status = (await app.inject('/api/status')).json();
  assert.equal(status.name, 'Cashket');
  assert.equal(status.setupRequired, true);
  await app.close();
});

test('migrations are applied once', () => {
  const sqlite = openDatabase('', ':memory:');
  assert.deepEqual(migrate(sqlite, migrationsDir), ['0001_init.sql']);
  assert.deepEqual(migrate(sqlite, migrationsDir), []);
});
