import { query, withTransaction } from '../db/pool.js';

export interface UserRow {
  id: string;
  username: string;
  username_lower: string;
  password_hash: string;
  avatar_id: number;
  language: string;
  created_at: Date;
  last_seen_at: Date;
  games_played: number;
  games_won: number;
  games_lost: number;
  games_drawn: number;
  current_streak: number;
  longest_streak: number;
}

export interface PublicUser {
  id: string;
  username: string;
  avatarId: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  winRate: number;
  currentStreak: number;
  longestStreak: number;
}

export function toPublicUser(row: UserRow): PublicUser {
  const winRate = row.games_played > 0 ? Math.round((row.games_won / row.games_played) * 10000) / 100 : 0;
  return {
    id: row.id,
    username: row.username,
    avatarId: row.avatar_id,
    gamesPlayed: row.games_played,
    gamesWon: row.games_won,
    gamesLost: row.games_lost,
    gamesDrawn: row.games_drawn,
    winRate,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
  };
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const r = await query<UserRow>(
    'SELECT * FROM users WHERE username_lower = $1 LIMIT 1',
    [username.toLowerCase()],
  );
  return r.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const r = await query<UserRow>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return r.rows[0] ?? null;
}

export async function createUser(input: {
  username: string;
  passwordHash: string;
  avatarId: number;
  language: string;
}): Promise<UserRow> {
  const r = await query<UserRow>(
    `INSERT INTO users (username, username_lower, password_hash, avatar_id, language)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.username, input.username.toLowerCase(), input.passwordHash, input.avatarId, input.language],
  );
  return r.rows[0];
}

export async function updateLastSeen(userId: string): Promise<void> {
  await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [userId]);
}

export async function updatePassword(userId: string, passwordHash: string): Promise<void> {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

export async function updateUsername(userId: string, newUsername: string): Promise<void> {
  await query('UPDATE users SET username = $1, username_lower = $2 WHERE id = $3', [
    newUsername,
    newUsername.toLowerCase(),
    userId,
  ]);
}

export async function updateAvatar(userId: string, avatarId: number): Promise<void> {
  await query('UPDATE users SET avatar_id = $1 WHERE id = $2', [avatarId, userId]);
}

export async function updateLanguage(userId: string, language: string): Promise<void> {
  await query('UPDATE users SET language = $1 WHERE id = $2', [language, userId]);
}

export async function deleteUser(userId: string): Promise<void> {
  await query('DELETE FROM users WHERE id = $1', [userId]);
}

export async function searchUsers(qstr: string, excludeUserId: string, limit = 10): Promise<UserRow[]> {
  const like = qstr.toLowerCase() + '%';
  const r = await query<UserRow>(
    `SELECT * FROM users
     WHERE username_lower LIKE $1 AND id <> $2
     ORDER BY username_lower LIMIT $3`,
    [like, excludeUserId, limit],
  );
  return r.rows;
}

/**
 * Apply match result to stats — transactionally updates both players.
 * resultForUser: 'win' | 'loss' | 'draw'
 */
export async function applyMatchResult(
  userId: string,
  result: 'win' | 'loss' | 'draw',
): Promise<void> {
  await withTransaction(async (client) => {
    if (result === 'win') {
      await client.query(
        `UPDATE users
         SET games_played = games_played + 1,
             games_won = games_won + 1,
             current_streak = current_streak + 1,
             longest_streak = GREATEST(longest_streak, current_streak + 1)
         WHERE id = $1`,
        [userId],
      );
    } else if (result === 'loss') {
      await client.query(
        `UPDATE users
         SET games_played = games_played + 1,
             games_lost = games_lost + 1,
             current_streak = 0
         WHERE id = $1`,
        [userId],
      );
    } else {
      await client.query(
        `UPDATE users
         SET games_played = games_played + 1,
             games_drawn = games_drawn + 1,
             current_streak = 0
         WHERE id = $1`,
        [userId],
      );
    }
  });
}
