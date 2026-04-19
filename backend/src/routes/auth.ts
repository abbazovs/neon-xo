import { Router } from 'express';
import { z } from 'zod';
import {
  hashPassword,
  verifyPassword,
  signToken,
  isValidUsername,
  isValidPassword,
} from '../auth/auth.js';
import { createSession, revokeSession } from '../auth/session.js';
import {
  findUserByUsername,
  findUserById,
  createUser,
  updatePassword,
  updateUsername,
  updateAvatar,
  updateLanguage,
  deleteUser,
  toPublicUser,
} from '../db/users.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/rateLimit.js';

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9_]{6,20}$/),
  password: z.string().min(8),
  avatarId: z.number().int().min(0).max(11),
  language: z.enum(['en', 'ru', 'uz']).default('en'),
});

authRouter.post('/register', authRateLimit, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const { username, password, avatarId, language } = parsed.data;
  if (!isValidUsername(username)) return res.status(400).json({ error: 'Invalid username' });
  if (!isValidPassword(password))
    return res.status(400).json({ error: 'Password must be 8+ chars with letter and number' });

  const existing = await findUserByUsername(username);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const passwordHash = await hashPassword(password);
  const user = await createUser({ username, passwordHash, avatarId, language });
  const sid = await createSession(user.id);
  const token = signToken({ sub: user.id, username: user.username, sid });
  return res.status(201).json({ token, user: toPublicUser(user) });
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

authRouter.post('/login', authRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { username, password } = parsed.data;

  const user = await findUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  // New login invalidates any previous session (single-device enforcement)
  const sid = await createSession(user.id);
  const token = signToken({ sub: user.id, username: user.username, sid });
  return res.json({ token, user: toPublicUser(user) });
});

authRouter.post('/logout', requireAuth, async (req: AuthedRequest, res) => {
  if (req.user) await revokeSession(req.user.sub);
  return res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const user = await findUserById(req.user!.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: toPublicUser(user) });
});

authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ oldPassword: z.string(), newPassword: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  if (!isValidPassword(parsed.data.newPassword))
    return res.status(400).json({ error: 'New password too weak' });

  const user = await findUserById(req.user!.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const ok = await verifyPassword(parsed.data.oldPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password incorrect' });

  const newHash = await hashPassword(parsed.data.newPassword);
  await updatePassword(user.id, newHash);
  // Invalidate all sessions after password change
  await revokeSession(user.id);
  return res.json({ ok: true });
});

authRouter.post('/change-username', requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ newUsername: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  if (!isValidUsername(parsed.data.newUsername))
    return res.status(400).json({ error: 'Invalid username' });
  const existing = await findUserByUsername(parsed.data.newUsername);
  if (existing) return res.status(409).json({ error: 'Username already taken' });
  await updateUsername(req.user!.sub, parsed.data.newUsername);
  return res.json({ ok: true });
});

authRouter.post('/change-avatar', requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ avatarId: z.number().int().min(0).max(11) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  await updateAvatar(req.user!.sub, parsed.data.avatarId);
  return res.json({ ok: true });
});

authRouter.post('/change-language', requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ language: z.enum(['en', 'ru', 'uz']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  await updateLanguage(req.user!.sub, parsed.data.language);
  return res.json({ ok: true });
});

authRouter.post('/logout-all', requireAuth, async (req: AuthedRequest, res) => {
  await revokeSession(req.user!.sub);
  return res.json({ ok: true });
});

authRouter.delete('/account', requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password required to confirm' });
  const user = await findUserById(req.user!.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const ok = await verifyPassword(parsed.data.password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Password incorrect' });
  await deleteUser(user.id);
  await revokeSession(user.id);
  return res.json({ ok: true });
});
