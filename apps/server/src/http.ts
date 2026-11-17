// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { HttpError } from './errors.ts';

export * from './errors.ts';

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'validation', issues: error.issues.map((i) => ({ path: i.path, code: i.code })) });
  }
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ error: error.code });
  }
  const statusCode = (error as FastifyError).statusCode;
  if (statusCode === 429) return reply.status(429).send({ error: 'tooMany' });
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return reply.status(statusCode).send({ error: 'validation' });
  }
  request.log.error(error);
  return reply.status(500).send({ error: 'internal' });
}
