// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolve } from 'node:path';

declare const __APP_VERSION__: string | undefined;

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  publicDir: string;
  migrationsDir: string;
  baseUrl: string | null;
  version: string;
  logLevel: string;
  trustProxy: false | string[];
}

/**
 * CASHKET_TRUST_PROXY: addresses or networks of the proxies in front of Cashket (cloudflared, a reverse
 * proxy), separated by commas ("none" to trust nobody). X-Forwarded-* headers count only from them.
 * Default: private and local addresses, where cloudflared on the same machine or Docker network lives.
 */
function trustProxy(value: string | undefined): Config['trustProxy'] {
  const v = value?.trim() || 'loopback, linklocal, uniquelocal';
  if (['none', 'false', '0'].includes(v.toLowerCase())) return false;
  return v.split(',').map((part) => part.trim()).filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir: resolve(env.CASHKET_DATA_DIR ?? './data'),
    publicDir: resolve(env.CASHKET_PUBLIC_DIR ?? './public'),
    migrationsDir: resolve(env.CASHKET_MIGRATIONS_DIR ?? './migrations'),
    baseUrl: env.CASHKET_BASE_URL?.trim().replace(/\/+$/, '') || null,
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    logLevel: env.LOG_LEVEL ?? 'info',
    trustProxy: trustProxy(env.CASHKET_TRUST_PROXY)
  };
}
