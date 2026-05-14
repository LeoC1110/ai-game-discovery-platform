import { verifyAuthToken } from '@shared/jwt';

export const extractTokenFromRequest = (req) => {
  if (req?.cookies?.token) return req.cookies.token;
  const authHeader = req?.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

export const getAuthContext = (req) => {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
};
