import jwt from 'jsonwebtoken';

const DEFAULT_TTL = '7d';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const buildPayload = (user) => ({
  sub: user.id || user._id?.toString(),
  uid: user.id || user._id?.toString(),
  username: user.username,
  role: user.role,
});

export const signAuthToken = (userOrPayload, options = {}) => {
  const payload = userOrPayload?.username ? buildPayload(userOrPayload) : userOrPayload;
  if (!payload?.uid && !payload?.sub) throw new Error('Invalid payload for JWT signing');
  return jwt.sign(payload, JWT_SECRET, { expiresIn: DEFAULT_TTL, ...options });
};

export const verifyAuthToken = (token, options = {}) => jwt.verify(token, JWT_SECRET, options);

export const setAuthCookie = (res, token) => {
  if (!res || !token) return;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  });
};

export const clearAuthCookie = (res) => {
  if (!res) return;
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax' });
};

export default {
  signAuthToken,
  verifyAuthToken,
  setAuthCookie,
  clearAuthCookie,
};
