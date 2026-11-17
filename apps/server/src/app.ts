// SPDX-License-Identifier: AGPL-3.0-or-later
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import type { Sqlite } from './db/index.ts';
import { PERMISSIONS_POLICY, contentSecurityPolicy } from './security.ts';

export interface AppContext {
  sqlite: Sqlite;
  config: Config;
}

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: ctx.config.logLevel },
    trustProxy: ctx.config.trustProxy,
    bodyLimit: 1024 * 1024
  });

  const csp = contentSecurityPolicy(ctx.config.publicDir);
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', PERMISSIONS_POLICY);
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (request.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=31536000');
    const type = String(reply.getHeader('content-type') ?? '');
    if (type.startsWith('text/html')) reply.header('Content-Security-Policy', csp);
    return payload;
  });

  await app.register(
    async (api) => {
      api.addHook('onRequest', async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      });
      // First endpoint: what the PWA needs before signing in. Auth, accounts, buckets, captures and the
      // session routes arrive with the roadmap in docs/SPEC.md §11.
      api.get('/status', async () => {
        const users = ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
        return { name: 'Cashket', version: ctx.config.version, setupRequired: users.n === 0 };
      });
    },
    { prefix: '/api' }
  );

  app.get('/healthz', async () => ({ ok: true }));

  const hasWeb = existsSync(join(ctx.config.publicDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: ctx.config.publicDir,
      wildcard: false,
      setHeaders(res, path) {
        if (/[\\/]_app[\\/]immutable[\\/]/.test(path)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    });
  }

  // Single-page app: unknown non-API GET requests get index.html; the client router takes over.
  app.setNotFoundHandler((request, reply) => {
    if (hasWeb && request.method === 'GET' && !request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ error: 'notFound' });
  });

  return app;
}
