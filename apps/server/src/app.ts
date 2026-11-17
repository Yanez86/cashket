// SPDX-License-Identifier: AGPL-3.0-or-later
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import type { Sqlite } from './db/core.ts';
import { loadUser } from './auth.ts';
import { errorHandler, forbidden } from './http.ts';
import { authRoutes } from './routes/auth.ts';
import { adminRoutes } from './routes/admin.ts';
import { moneyRoutes } from './routes/money.ts';
import { sessionRoutes } from './routes/session.ts';
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

  app.setErrorHandler(errorHandler);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.decorateRequest('user', null);

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
      api.addHook('onRequest', async (request, reply) => {
        // Browsers say where a request comes from. A page on another site, or on a sibling subdomain
        // (which SameSite=Lax cookies do not stop), may read nothing here and must not change anything.
        const site = request.headers['sec-fetch-site'];
        if (!['GET', 'HEAD'].includes(request.method) && (site === 'cross-site' || site === 'same-site')) throw forbidden('crossSite');
        request.user = loadUser(ctx.sqlite, request, reply);
        reply.header('Cache-Control', 'no-store');
      });
      await api.register(async (scope) => authRoutes(scope, ctx));
      await api.register(async (scope) => adminRoutes(scope, ctx), { prefix: '/admin' });
      await api.register(async (scope) => moneyRoutes(scope, ctx));
      await api.register(async (scope) => sessionRoutes(scope, ctx));
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
