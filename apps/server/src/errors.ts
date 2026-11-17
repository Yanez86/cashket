// SPDX-License-Identifier: AGPL-3.0-or-later
// Errors with an HTTP status and a stable code the web app translates. No dependencies, so the services
// that throw them can be tested on their own.
export class HttpError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (code = 'validation') => new HttpError(400, code);
export const unauthorized = () => new HttpError(401, 'unauthorized');
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = () => new HttpError(404, 'notFound');
export const conflict = (code: string) => new HttpError(409, code);
