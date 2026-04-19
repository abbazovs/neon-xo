import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../auth/auth.js';
import { isSessionValid } from '../auth/session.js';

export interface AuthedRequest extends Request {
  user?: JwtPayload;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const valid = await isSessionValid(payload.sub, payload.sid);
  if (!valid) {
    res.status(401).json({ error: 'Session revoked', code: 'session_revoked' });
    return;
  }

  req.user = payload;
  next();
}

export async function optionalAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
  if (!token) return next();
  const payload = verifyToken(token);
  if (payload && (await isSessionValid(payload.sub, payload.sid))) req.user = payload;
  next();
}
