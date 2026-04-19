import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface JwtPayload {
  sub: string; // user id
  username: string;
  sid: string; // session id (for single-tab/single-device enforcement)
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

// Validation regexes matching the frontend
export const USERNAME_REGEX = /^[A-Za-z0-9_]{6,20}$/;
export function isValidUsername(u: string): boolean {
  return USERNAME_REGEX.test(u);
}

export function isValidPassword(p: string): boolean {
  if (p.length < 8) return false;
  return /[A-Za-z]/.test(p) && /[0-9]/.test(p);
}
