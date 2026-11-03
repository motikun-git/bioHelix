import mongoose from 'mongoose';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Validate data with a zod schema; throws a 400 with readable messages. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
      .join('; ');
    throw new HttpError(400, message);
  }
  return result.data;
}

/**
 * For PATCH: validate with a partial schema but keep only the fields the
 * client actually sent, so defaults (status, passMarks...) never overwrite saved values.
 */
export function parsePatch(schema, data = {}) {
  const parsed = parse(schema.partial(), data);
  const sent = new Set(Object.keys(data || {}));
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => sent.has(key)));
}

export function assertObjectId(id, label = 'id') {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, `Invalid ${label}`);
}

export function notFound(req, res) {
  res.status(404).json({ message: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, ...err.extra });
  }
  if (err?.name === 'CastError') return res.status(400).json({ message: `Invalid ${err.path}` });
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    return res.status(409).json({ message: `This ${field} already exists` });
  }
  if (err?.name === 'MulterError') return res.status(400).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server' });
}
