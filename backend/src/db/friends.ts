import { nanoid } from 'nanoid';
import { query } from '../db/pool.js';
import type { UserRow } from './users.js';

/**
 * Friendships are stored with canonical ordering (user_a_id < user_b_id)
 * so each pair has exactly one row regardless of who initiated.
 */
function canonicalOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const [a, b] = canonicalOrder(userA, userB);
  const r = await query(
    'SELECT 1 FROM friendships WHERE user_a_id = $1 AND user_b_id = $2 LIMIT 1',
    [a, b],
  );
  return r.rowCount! > 0;
}

export async function addFriendship(userA: string, userB: string): Promise<void> {
  if (userA === userB) return;
  const [a, b] = canonicalOrder(userA, userB);
  await query(
    `INSERT INTO friendships (user_a_id, user_b_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [a, b],
  );
}

export async function removeFriendship(userA: string, userB: string): Promise<void> {
  const [a, b] = canonicalOrder(userA, userB);
  await query('DELETE FROM friendships WHERE user_a_id = $1 AND user_b_id = $2', [a, b]);
}

export async function listFriends(userId: string): Promise<UserRow[]> {
  const r = await query<UserRow>(
    `SELECT u.* FROM users u
     JOIN friendships f ON (f.user_a_id = u.id OR f.user_b_id = u.id)
     WHERE (f.user_a_id = $1 OR f.user_b_id = $1) AND u.id <> $1
     ORDER BY u.username_lower`,
    [userId],
  );
  return r.rows;
}

// Friend invite links
export async function createFriendInvite(userId: string): Promise<string> {
  const token = nanoid(20);
  await query(
    `INSERT INTO friend_invites (token, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [token, userId],
  );
  return token;
}

export async function findFriendInvite(
  token: string,
): Promise<{ userId: string; expired: boolean } | null> {
  const r = await query<{ user_id: string; expires_at: Date | null }>(
    'SELECT user_id, expires_at FROM friend_invites WHERE token = $1',
    [token],
  );
  const row = r.rows[0];
  if (!row) return null;
  const expired = row.expires_at ? row.expires_at.getTime() < Date.now() : false;
  return { userId: row.user_id, expired };
}

export async function deleteFriendInvite(token: string): Promise<void> {
  await query('DELETE FROM friend_invites WHERE token = $1', [token]);
}

export async function getLatestFriendInvite(userId: string): Promise<string | null> {
  // Return the newest non-expired invite; create on demand if none.
  const r = await query<{ token: string; expires_at: Date | null }>(
    `SELECT token, expires_at FROM friend_invites
     WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return r.rows[0]?.token ?? null;
}
