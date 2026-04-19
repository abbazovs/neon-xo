import { Router } from 'express';
import { z } from 'zod';
import {
  searchUsers,
  findUserById,
  findUserByUsername,
  toPublicUser,
} from '../db/users.js';
import {
  addFriendship,
  areFriends,
  createFriendInvite,
  deleteFriendInvite,
  findFriendInvite,
  getLatestFriendInvite,
  listFriends,
  removeFriendship,
} from '../db/friends.js';
import {
  getFriendsLeaderboard,
  getGlobalLeaderboard,
  getMatchHistory,
} from '../db/matches.js';
import { getOnlineUsers } from '../db/redis.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const usersRouter = Router();

usersRouter.get('/search', requireAuth, async (req: AuthedRequest, res) => {
  const qRaw = req.query.q;
  const q = (Array.isArray(qRaw) ? qRaw[0] : qRaw ?? '').toString().trim();
  if (q.length < 2) return res.json({ users: [] });
  const rows = await searchUsers(q, req.user!.sub, 10);
  const onlineIds = await getOnlineUsers(rows.map((r) => r.id));
  const friendRows = await listFriends(req.user!.sub);
  const friendIds = new Set(friendRows.map((f) => f.id));
  return res.json({
    users: rows.map((u) => ({
      id: u.id,
      username: u.username,
      avatarId: u.avatar_id,
      online: onlineIds.has(u.id),
      isFriend: friendIds.has(u.id),
    })),
  });
});

export const friendsRouter = Router();

friendsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const rows = await listFriends(req.user!.sub);
  const onlineIds = await getOnlineUsers(rows.map((r) => r.id));
  return res.json({
    friends: rows.map((u) => ({
      id: u.id,
      username: u.username,
      avatarId: u.avatar_id,
      online: onlineIds.has(u.id),
    })),
  });
});

friendsRouter.delete('/:friendId', requireAuth, async (req: AuthedRequest, res) => {
  const friendId = String(req.params.friendId ?? '');
  await removeFriendship(req.user!.sub, friendId);
  return res.json({ ok: true });
});

friendsRouter.get('/invite-link', requireAuth, async (req: AuthedRequest, res) => {
  let token = await getLatestFriendInvite(req.user!.sub);
  if (!token) token = await createFriendInvite(req.user!.sub);
  return res.json({ token });
});

friendsRouter.post('/invite-link/rotate', requireAuth, async (req: AuthedRequest, res) => {
  const token = await createFriendInvite(req.user!.sub);
  return res.json({ token });
});

const acceptSchema = z.object({ token: z.string() });
friendsRouter.post('/accept-invite', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const invite = await findFriendInvite(parsed.data.token);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.expired) {
    await deleteFriendInvite(parsed.data.token);
    return res.status(410).json({ error: 'Invite expired' });
  }
  if (invite.userId === req.user!.sub)
    return res.status(400).json({ error: "You can't friend yourself" });
  await addFriendship(invite.userId, req.user!.sub);
  const other = await findUserById(invite.userId);
  return res.json({
    ok: true,
    friend: other ? { id: other.id, username: other.username, avatarId: other.avatar_id } : null,
  });
});

export const leaderboardRouter = Router();

leaderboardRouter.get('/global', async (_req, res) => {
  const rows = await getGlobalLeaderboard(100);
  return res.json({ leaderboard: rows });
});

leaderboardRouter.get('/friends', requireAuth, async (req: AuthedRequest, res) => {
  const rows = await getFriendsLeaderboard(req.user!.sub);
  return res.json({ leaderboard: rows });
});

export const matchesRouter = Router();

matchesRouter.get('/history', requireAuth, async (req: AuthedRequest, res) => {
  const rows = await getMatchHistory(req.user!.sub, 50);
  return res.json({
    matches: rows.map((m) => ({
      id: m.id,
      code: m.code,
      opponent:
        m.player1_user_id === req.user!.sub
          ? { userId: m.player2_user_id, name: m.player2_name }
          : { userId: m.player1_user_id, name: m.player1_name },
      result:
        m.result === 'draw'
          ? 'draw'
          : (m.result === 'p1_win' && m.player1_user_id === req.user!.sub) ||
              (m.result === 'p2_win' && m.player2_user_id === req.user!.sub)
            ? 'win'
            : 'loss',
      boardSize: m.board_size,
      format: m.format,
      finishedAt: m.finished_at,
    })),
  });
});
