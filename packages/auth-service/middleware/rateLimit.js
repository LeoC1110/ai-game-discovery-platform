const store = new Map();

const now = () => Date.now();

const consume = ({ key, limit, windowMs }) => {
  const ts = now();
  const prev = store.get(key);
  const existing = !prev || prev.resetAt <= ts
    ? { count: 0, resetAt: ts + windowMs }
    : prev;
  const next = {
    count: existing.count + 1,
    resetAt: existing.resetAt,
  };
  store.set(key, next);

  const remaining = Math.max(0, limit - next.count);
  const retryAfterMs = Math.max(0, next.resetAt - ts);
  return {
    allowed: next.count <= limit,
    remaining,
    retryAfterMs,
    resetAt: next.resetAt,
  };
};

export const getClientIp = (req) => {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
};

export const checkRateLimit = ({
  bucket,
  key,
  limit,
  windowMs,
}) => {
  if (process.env.NODE_ENV === 'test') {
    return { allowed: true, remaining: limit, retryAfterMs: 0, resetAt: now() + windowMs };
  }
  return consume({ key: `${bucket}:${key}`, limit, windowMs });
};

export const createRateLimitMiddleware = ({
  bucket,
  limit,
  windowMs,
  keyFn,
}) => {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : getClientIp(req);
    const result = checkRateLimit({ bucket, key, limit, windowMs });
    if (result.allowed) return next();

    const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      errors: [
        {
          message: 'Too many requests. Please try again later.',
          extensions: { code: 'RATE_LIMITED' },
        },
      ],
    });
  };
};
