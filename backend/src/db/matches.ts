import { query } from '../db/pool.js';
import type { LiveMatch } from '../game/state.js';

export interface MatchRow {
  id: string;
  code: string;
  player1_user_id: string | null;
  player2_user_id: string | null;
  player1_name: string;
  player2_name: string | null;
  board_size: number;
  format: string;
  timer_seconds: number;
  status: string;
  winner_user_id: string | null;
  result: string | null;
  end_reason: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  expires_at: Date | null;
}

export async function insertMatch(m: LiveMatch): Promise<void> {
  await query(
    `INSERT INTO matches
      (id, code, player1_user_id, player2_user_id, player1_name, player2_name,
       board_size, format, timer_seconds, status, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11/1000.0))
     ON CONFLICT (id) DO NOTHING`,
    [
      m.id,
      m.code,
      m.p1.userId,
      m.p2?.userId ?? null,
      m.p1.displayName,
      m.p2?.displayName ?? null,
      m.boardSize,
      m.format,
      m.timerSeconds,
      m.status,
      m.expiresAt,
    ],
  );
}

export async function updateMatchStatus(id: string, status: string): Promise<void> {
  await query('UPDATE matches SET status = $1 WHERE id = $2', [status, id]);
}

export async function finalizeMatch(m: LiveMatch): Promise<void> {
  await query(
    `UPDATE matches
     SET status = $1, winner_user_id = $2, result = $3, end_reason = $4,
         finished_at = NOW(), player2_user_id = $5, player2_name = $6
     WHERE id = $7`,
    [
      m.status,
      m.winnerUserId,
      m.result,
      m.endReason,
      m.p2?.userId ?? null,
      m.p2?.displayName ?? null,
      m.id,
    ],
  );
}

export async function getMatchHistory(userId: string, limit = 50): Promise<MatchRow[]> {
  const r = await query<MatchRow>(
    `SELECT * FROM matches
     WHERE (player1_user_id = $1 OR player2_user_id = $1)
       AND status = 'finished'
     ORDER BY finished_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return r.rows;
}

export async function getGlobalLeaderboard(limit = 100) {
  const r = await query(
    `SELECT id, username, avatar_id, games_played, games_won, win_rate
     FROM leaderboard_global
     LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export async function getFriendsLeaderboard(userId: string) {
  const r = await query(
    `SELECT u.id, u.username, u.avatar_id, u.games_played, u.games_won,
            CASE WHEN u.games_played > 0
                 THEN ROUND((u.games_won::numeric / u.games_played) * 100, 2)
                 ELSE 0 END AS win_rate
     FROM users u
     JOIN friendships f ON (f.user_a_id = u.id OR f.user_b_id = u.id)
     WHERE (f.user_a_id = $1 OR f.user_b_id = $1) AND u.id <> $1
     ORDER BY win_rate DESC, u.games_won DESC`,
    [userId],
  );
  return r.rows;
}

/**
 * Nightly cleanup: delete voided/abandoned matches older than N days.
 */
export async function cleanupAbandonedMatches(days: number): Promise<number> {
  const r = await query(
    `DELETE FROM matches
     WHERE status IN ('waiting', 'abandoned', 'voided')
       AND created_at < NOW() - ($1 || ' days')::interval`,
    [days],
  );
  return r.rowCount ?? 0;
}
