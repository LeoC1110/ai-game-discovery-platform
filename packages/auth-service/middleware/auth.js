import User from '../models/User.js';
import { verifyAuthToken } from '@shared/jwt';

export const extractTokenFromRequest = (req) => {
  if (req?.cookies?.token) return req.cookies.token;
  const authHeader = req?.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

export const getUserFromToken = async (req) => {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  try {
    const payload = verifyAuthToken(token);
    const userId = payload.uid || payload.sub;
    if (!userId) return null;
    return await User.findById(userId);
  } catch {
    return null;
  }
};