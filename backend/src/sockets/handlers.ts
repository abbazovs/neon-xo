import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { verifyToken } from '../auth/auth.js';
import { isSessionValid } from '../auth/session.js';
import { env } from '../config/env.js';
import { findUserById, applyMatchResult, updateLastSeen } from '../db/users.js';
import { finalizeMatch, insertMatch, updateMatchStatus } from '../db/matches.js';
import { markOffline, markOnline } from '../db/redis.js';
import {
  applyMove,
  createEmptyBoard,
  otherPlayer,
  roundsToWin,
} from '../game/engine.js';
import {
  createLiveMatch,
  deleteMatch,
  dequeueQuickMatchPair,
  enqueueQuickMatch,
  loadMatch,
  removeFromQuickQueue,
  removeUserFromQuickQueue,
  saveMatch,
  type LiveMatch,
} from '../game/state.js';
import { roomName, toPublicState } from './helpers.js';
import type { ClientToServerEvents, ServerToClientEvents } from './events.js';

const ALLOWED_EMOJIS = ['🔥', '😂', '😭', '👏'] as const;
const codeOnlySchema = z.object({ code: z.string().min(1).max(40) });
const matchCreateSchema = z.object({
  boardSize: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  format: z.enum(['single', 'bo3', 'bo5']),
  timerSeconds: z.union([z.literal(0), z.literal(10), z.literal(30)]),
  guestName: z.string().min(1).max(40).optional(),
  guestAvatarId: z.number().int().min(0).max(11).optional(),
});
const matchJoinSchema = codeOnlySchema.extend({
  guestName: z.string().min(1).max(40).optional(),
  guestAvatarId: z.number().int().min(0).max(11).optional(),
});
const matchMoveSchema = codeOnlySchema.extend({
  index: z.number().int().min(0).max(24),
});
const matchEmojiSchema = codeOnlySchema.extend({
  emoji: z.enum(ALLOWED_EMOJIS),
});

interface SocketData {
  userId: string | null;
  username: string | null;
  sid: string | null;
  avatarId: number;
  activeMatchCode: string | null;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type SocketT = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

// Per-match timers kept in memory on the node that owns the active turn.
// If the node goes down, a replacement node will not enforce timers — acceptable for v1.
const moveTimers = new Map<string, NodeJS.Timeout>();

// Pending rematch offers, keyed by match code. Lives on the module so both
// players' sockets share it (a per-socket Map would never reach size 2).
const rematchOffers = new Map<string, Set<'p1' | 'p2'>>();

// Per-side disconnect timers. While running, the side has DISCONNECT_GRACE_MS
// to reconnect before the opponent is auto-awarded the match.
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const disconnectKey = (code: string, side: 'p1' | 'p2') => `${code}:${side}`;
function clearDisconnectTimer(code: string, side: 'p1' | 'p2'): void {
  const k = disconnectKey(code, side);
  const t = disconnectTimers.get(k);
  if (t) {
    clearTimeout(t);
    disconnectTimers.delete(k);
  }
}

function clearMoveTimer(code: string): void {
  const t = moveTimers.get(code);
  if (t) {
    clearTimeout(t);
    moveTimers.delete(code);
  }
}

function scheduleMoveTimer(io: IO, match: LiveMatch): void {
  clearMoveTimer(match.code);
  if (match.timerSeconds === 0) return;
  const delayMs = match.timerSeconds * 1000;
  match.moveDeadline = Date.now() + delayMs;
  const t = setTimeout(async () => {
    const m = await loadMatch(match.code);
    if (!m || m.status !== 'active') return;
    // Whoever's turn it is loses the match (per spec: timeout = auto-win opponent)
    const losingSide: 'p1' | 'p2' = m.turn === 'X' ? 'p1' : 'p2';
    await finishMatch(io, m, losingSide === 'p1' ? 'p2' : 'p1', 'timeout');
  }, delayMs);
  moveTimers.set(match.code, t);
}

function sideOf(m: LiveMatch, socketId: string): 'p1' | 'p2' | null {
  if (m.p1.socketId === socketId) return 'p1';
  if (m.p2?.socketId === socketId) return 'p2';
  return null;
}

/**
 * Auth middleware for sockets.
 * Guests connect without tokens (userId stays null).
 */
export async function socketAuthMiddleware(socket: SocketT, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token as string | undefined;
  socket.data.userId = null;
  socket.data.username = null;
  socket.data.sid = null;
  socket.data.avatarId = 0;
  socket.data.activeMatchCode = null;

  if (!token) return next(); // guest

  const payload = verifyToken(token);
  if (!payload) return next(); // treat as guest
  const valid = await isSessionValid(payload.sub, payload.sid);
  if (!valid) {
    socket.emit('session:revoked');
    return next();
  }
  const user = await findUserById(payload.sub);
  if (!user) return next();
  socket.data.userId = user.id;
  socket.data.username = user.username;
  socket.data.sid = payload.sid;
  socket.data.avatarId = user.avatar_id;
  next();
}

export function registerSocketHandlers(io: IO): void {
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    if (socket.data.userId) {
      // Single-tab enforcement: disconnect any previous socket for this user
      const existing = await io.in(`user:${socket.data.userId}`).fetchSockets();
      for (const s of existing) {
        if (s.id !== socket.id) {
          s.emit('session:duplicate');
          s.disconnect(true);
        }
      }
      socket.join(`user:${socket.data.userId}`);
      await markOnline(socket.data.userId, socket.id);
      await updateLastSeen(socket.data.userId).catch(() => {});
    }

    socket.on('presence:ping', async () => {
      if (socket.data.userId) await markOnline(socket.data.userId, socket.id);
    });

    socket.on('match:create', async (payload, ack) => {
      try {
        const parsed = matchCreateSchema.safeParse(payload);
        if (!parsed.success) return ack({ ok: false, error: 'Invalid input' });
        const data = parsed.data;

        let displayName: string;
        let avatarId: number;
        if (socket.data.userId) {
          displayName = socket.data.username!;
          avatarId = socket.data.avatarId;
        } else {
          const guestName = (data.guestName ?? '').trim();
          if (!guestName) return ack({ ok: false, error: 'Invalid guest name' });
          displayName = guestName;
          avatarId = data.guestAvatarId ?? 0;
        }

        const expiryMs = env.MATCH_INVITE_EXPIRY_MINUTES * 60 * 1000;
        const m = createLiveMatch(
          {
            boardSize: data.boardSize,
            format: data.format,
            timerSeconds: data.timerSeconds,
            p1UserId: socket.data.userId,
            p1DisplayName: displayName,
            p1AvatarId: avatarId,
            p1SocketId: socket.id,
          },
          expiryMs,
        );
        await saveMatch(m);
        await insertMatch(m);
        socket.join(roomName(m.code));
        socket.data.activeMatchCode = m.code;
        ack({ ok: true, code: m.code, side: 'p1', state: toPublicState(m) });
      } catch (err) {
        console.error('match:create error', err);
        ack({ ok: false, error: 'Server error' });
      }
    });

    socket.on('match:join', async (payload, ack) => {
      try {
        const parsed = matchJoinSchema.safeParse(payload);
        if (!parsed.success) return ack({ ok: false, error: 'Invalid input' });
        const data = parsed.data;
        const m = await loadMatch(data.code);
        if (!m) return ack({ ok: false, error: 'Match not found' });
        if (Date.now() > m.expiresAt && m.status === 'waiting') {
          await deleteMatch(m.code);
          return ack({ ok: false, error: 'Invite expired' });
        }

        // Same-socket rejoin (covers Home -> /match/{code} navigation for guests,
        // who have no userId-based identity to match against).
        if (m.p1.socketId === socket.id) {
          m.p1.connected = true;
          clearDisconnectTimer(m.code, 'p1');
          await saveMatch(m);
          socket.join(roomName(m.code));
          socket.data.activeMatchCode = m.code;
          return ack({ ok: true, side: 'p1', state: toPublicState(m) });
        }
        if (m.p2?.socketId === socket.id) {
          m.p2.connected = true;
          clearDisconnectTimer(m.code, 'p2');
          await saveMatch(m);
          socket.join(roomName(m.code));
          socket.data.activeMatchCode = m.code;
          return ack({ ok: true, side: 'p2', state: toPublicState(m) });
        }

        // Registered-user reconnect from a new socket
        if (socket.data.userId && m.p1.userId === socket.data.userId) {
          m.p1.socketId = socket.id;
          m.p1.connected = true;
          clearDisconnectTimer(m.code, 'p1');
          await saveMatch(m);
          socket.join(roomName(m.code));
          socket.data.activeMatchCode = m.code;
          return ack({ ok: true, side: 'p1', state: toPublicState(m) });
        }
        if (socket.data.userId && m.p2?.userId === socket.data.userId) {
          m.p2.socketId = socket.id;
          m.p2.connected = true;
          clearDisconnectTimer(m.code, 'p2');
          await saveMatch(m);
          socket.join(roomName(m.code));
          socket.data.activeMatchCode = m.code;
          return ack({ ok: true, side: 'p2', state: toPublicState(m) });
        }

        if (m.status !== 'waiting') return ack({ ok: false, error: 'Match already started or ended' });
        if (m.p2) return ack({ ok: false, error: 'Match is full' });

        let displayName: string;
        let avatarId: number;
        if (socket.data.userId) {
          if (m.p1.userId === socket.data.userId)
            return ack({ ok: false, error: "You can't play against yourself" });
          displayName = socket.data.username!;
          avatarId = socket.data.avatarId;
        } else {
          const guestName = (data.guestName ?? '').trim();
          if (!guestName) return ack({ ok: false, error: 'Invalid guest name' });
          if (guestName.toLowerCase() === m.p1.displayName.toLowerCase())
            return ack({ ok: false, error: 'Name already taken in this match' });
          displayName = guestName;
          avatarId = data.guestAvatarId ?? 1;
        }

        m.p2 = {
          socketId: socket.id,
          userId: socket.data.userId,
          displayName,
          avatarId,
          connected: true,
        };
        m.status = 'coin_flip';
        await saveMatch(m);
        await updateMatchStatus(m.id, 'coin_flip');
        socket.join(roomName(m.code));
        socket.data.activeMatchCode = m.code;
        io.to(roomName(m.code)).emit('match:state', toPublicState(m));
        scheduleCoinFlip(io, m.code);
        ack({ ok: true, side: 'p2', state: toPublicState(m) });
      } catch (err) {
        console.error('match:join error', err);
        ack({ ok: false, error: 'Server error' });
      }
    });

    socket.on('match:coinFlip', async (payload, ack) => {
      const parsed = codeOnlySchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Invalid input' });
      const m = await loadMatch(parsed.data.code);
      if (!m) return ack({ ok: false, error: 'Match not found' });
      if (m.status !== 'coin_flip') return ack({ ok: false, error: 'Not in coin-flip phase' });
      if (!sideOf(m, socket.id)) return ack({ ok: false, error: 'Not a player' });
      const result = await triggerCoinFlip(io, m.code);
      if (!result) return ack({ ok: false, error: 'Already started' });
      ack({ ok: true, first: result });
    });

    socket.on('match:move', async (payload, ack) => {
      const parsed = matchMoveSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Invalid input' });
      const data = parsed.data;
      const m = await loadMatch(data.code);
      if (!m) return ack({ ok: false, error: 'Match not found' });
      if (m.status !== 'active') return ack({ ok: false, error: 'Match not active' });
      const side = sideOf(m, socket.id);
      if (!side) return ack({ ok: false, error: 'Not a player in this match' });
      if (data.index >= m.boardSize * m.boardSize)
        return ack({ ok: false, error: 'out_of_bounds' });
      const player = side === 'p1' ? 'X' : 'O';
      const res = applyMove(m.board, data.index, player, m.turn, m.boardSize);
      if (!res.ok) return ack({ ok: false, error: res.reason });
      m.board = res.board;
      ack({ ok: true });

      if (res.winner) {
        clearMoveTimer(m.code);
        const winnerSide = side;
        if (winnerSide === 'p1') m.p1Score++;
        else m.p2Score++;

        const seriesOver = m.p1Score >= m.roundsToWin || m.p2Score >= m.roundsToWin;
        const publicState = toPublicState(m, res.winner.line);
        io.to(roomName(m.code)).emit('match:roundEnd', {
          winnerSide,
          draw: false,
          winLine: res.winner.line,
          state: publicState,
        });

        if (seriesOver) {
          await finishMatch(io, m, winnerSide, 'normal');
        } else {
          await scheduleNextRound(io, m.code);
        }
      } else if (res.draw) {
        clearMoveTimer(m.code);
        const publicState = toPublicState(m);
        io.to(roomName(m.code)).emit('match:roundEnd', {
          winnerSide: null,
          draw: true,
          winLine: null,
          state: publicState,
        });
        if (m.format === 'single') {
          await finishMatch(io, m, null, 'normal');
        } else {
          await scheduleNextRound(io, m.code);
        }
      } else {
        m.turn = otherPlayer(m.turn);
        scheduleMoveTimer(io, m);
        await saveMatch(m);
        io.to(roomName(m.code)).emit('match:moveMade', {
          index: data.index,
          by: player,
          state: toPublicState(m),
        });
      }
    });

    socket.on('match:surrender', async (payload, ack) => {
      const parsed = codeOnlySchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Invalid input' });
      const m = await loadMatch(parsed.data.code);
      if (!m) return ack({ ok: false, error: 'Match not found' });
      if (m.status !== 'active' && m.status !== 'coin_flip')
        return ack({ ok: false, error: 'Match not active' });
      const side = sideOf(m, socket.id);
      if (!side) return ack({ ok: false, error: 'Not a player' });
      await finishMatch(io, m, side === 'p1' ? 'p2' : 'p1', 'surrender');
      ack({ ok: true });
    });

    socket.on('match:cancel', async (payload, ack) => {
      const parsed = codeOnlySchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Invalid input' });
      const m = await loadMatch(parsed.data.code);
      if (!m) return ack({ ok: false, error: 'Match not found' });
      if (m.status !== 'waiting') return ack({ ok: false, error: 'Cannot cancel — match started' });
      if (sideOf(m, socket.id) !== 'p1') return ack({ ok: false, error: 'Only host can cancel' });
      m.status = 'voided';
      await saveMatch(m);
      await updateMatchStatus(m.id, 'voided');
      io.to(roomName(m.code)).emit('match:state', toPublicState(m));
      await deleteMatch(m.code);
      ack({ ok: true });
    });

    // Rematch: both players must click rematch — module-level rematchOffers
    // map is shared across both sockets so the size==2 condition is reachable.
    socket.on('match:rematch', async (payload, ack) => {
      const parsed = codeOnlySchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Invalid input' });
      const m = await loadMatch(parsed.data.code);
      if (!m) return ack({ ok: false, error: 'Match not found' });
      if (m.status !== 'finished') return ack({ ok: false, error: 'Match not finished' });
      const side = sideOf(m, socket.id);
      if (!side) return ack({ ok: false, error: 'Not a player' });
      const offers = rematchOffers.get(m.code) ?? new Set();
      offers.add(side);
      rematchOffers.set(m.code, offers);
      io.to(roomName(m.code)).emit('match:rematchOffered', { by: side });
      if (offers.size === 2) {
        rematchOffers.delete(m.code);
        m.board = createEmptyBoard(m.boardSize);
        m.p1Score = 0;
        m.p2Score = 0;
        m.roundNumber = 1;
        m.roundsToWin = roundsToWin(m.format);
        m.result = null;
        m.endReason = null;
        m.winnerUserId = null;
        m.status = 'coin_flip';
        m.moveDeadline = null;
        await saveMatch(m);
        await updateMatchStatus(m.id, 'coin_flip');
        io.to(roomName(m.code)).emit('match:state', toPublicState(m));
        scheduleCoinFlip(io, m.code);
      }
      ack({ ok: true });
    });

    socket.on('match:emoji', async (payload) => {
      const parsed = matchEmojiSchema.safeParse(payload);
      if (!parsed.success) return;
      const m = await loadMatch(parsed.data.code);
      if (!m) return;
      const side = sideOf(m, socket.id);
      if (!side) return;
      socket.to(roomName(m.code)).emit('match:emoji', { by: side, emoji: parsed.data.emoji });
    });

    socket.on('quickmatch:enqueue', async (ack) => {
      if (!socket.data.userId) return ack({ ok: false, error: 'Login required for Quick Match' });
      // Drop any prior queue entries from this user (different socket, double-tap)
      // before adding a fresh one — keeps the queue free of stale sockets.
      await removeUserFromQuickQueue(socket.data.userId);
      await enqueueQuickMatch(socket.data.userId, socket.id);
      const pair = await dequeueQuickMatchPair();
      if (pair) {
        const socketA = io.sockets.sockets.get(pair.a.socketId);
        const socketB = io.sockets.sockets.get(pair.b.socketId);
        if (!socketA || !socketB || pair.a.userId === pair.b.userId) {
          // One side is gone (or both entries are the same user) — re-queue what's still alive.
          if (socketA) await enqueueQuickMatch(pair.a.userId, pair.a.socketId);
          if (socketB) await enqueueQuickMatch(pair.b.userId, pair.b.socketId);
          return ack({ ok: true });
        }
        const userA = await findUserById(pair.a.userId);
        const userB = await findUserById(pair.b.userId);
        if (!userA || !userB) return ack({ ok: false, error: 'Pairing failed' });
        const m = createLiveMatch(
          {
            boardSize: 3,
            format: 'single',
            timerSeconds: 0,
            p1UserId: userA.id,
            p1DisplayName: userA.username,
            p1AvatarId: userA.avatar_id,
            p1SocketId: pair.a.socketId,
            isQuickMatch: true,
          },
          60 * 60 * 1000,
        );
        m.p2 = {
          socketId: pair.b.socketId,
          userId: userB.id,
          displayName: userB.username,
          avatarId: userB.avatar_id,
          connected: true,
        };
        m.status = 'coin_flip';
        await saveMatch(m);
        await insertMatch(m);
        await updateMatchStatus(m.id, 'coin_flip');
        socketA.join(roomName(m.code));
        socketB.join(roomName(m.code));
        socketA.data.activeMatchCode = m.code;
        socketB.data.activeMatchCode = m.code;
        io.to(pair.a.socketId).emit('quickmatch:paired', { code: m.code });
        io.to(pair.b.socketId).emit('quickmatch:paired', { code: m.code });
        scheduleCoinFlip(io, m.code);
      }
      ack({ ok: true });
    });

    socket.on('quickmatch:cancel', async () => {
      if (socket.data.userId) await removeFromQuickQueue(socket.data.userId, socket.id);
    });

    socket.on('disconnect', async () => {
      if (socket.data.userId) {
        await markOffline(socket.data.userId);
        await removeFromQuickQueue(socket.data.userId, socket.id);
      }
      // Handle in-match disconnect
      const code = socket.data.activeMatchCode;
      if (!code) return;
      const m = await loadMatch(code);
      if (!m) return;
      const side = sideOf(m, socket.id);
      if (!side) return;

      if (m.status === 'waiting') {
        // Host left before anyone joined — void
        m.status = 'voided';
        await saveMatch(m);
        await updateMatchStatus(m.id, 'voided');
        await deleteMatch(m.code);
        return;
      }

      if (m.status === 'active' || m.status === 'coin_flip') {
        if (side === 'p1') m.p1.connected = false;
        else if (m.p2) m.p2.connected = false;
        await saveMatch(m);

        const bothGone = !m.p1.connected && (!m.p2 || !m.p2.connected);
        if (bothGone) {
          clearMoveTimer(m.code);
          clearDisconnectTimer(m.code, 'p1');
          clearDisconnectTimer(m.code, 'p2');
          await finishMatch(io, m, null, 'both_disconnect');
          return;
        }

        if (env.DISCONNECT_GRACE_MS <= 0) {
          // Immediate auto-win for the opponent
          clearMoveTimer(m.code);
          await finishMatch(io, m, side === 'p1' ? 'p2' : 'p1', 'disconnect');
          return;
        }

        // Schedule auto-win after the grace period; cleared if the player
        // reconnects via match:join before it fires.
        clearDisconnectTimer(m.code, side);
        const timer = setTimeout(async () => {
          disconnectTimers.delete(disconnectKey(m.code, side));
          const latest = await loadMatch(m.code);
          if (!latest || latest.status === 'finished' || latest.status === 'voided') return;
          const stillGone = side === 'p1' ? !latest.p1.connected : !latest.p2?.connected;
          if (!stillGone) return;
          clearMoveTimer(latest.code);
          await finishMatch(io, latest, side === 'p1' ? 'p2' : 'p1', 'disconnect');
        }, env.DISCONNECT_GRACE_MS);
        disconnectTimers.set(disconnectKey(m.code, side), timer);
      }
    });
  });
}

/**
 * Server-driven coin flip. Idempotent: if the match isn't in coin_flip
 * status anymore (round already started or match ended), this is a no-op.
 * Returns the chosen first-player side, or null if nothing happened.
 */
async function triggerCoinFlip(io: IO, code: string): Promise<'p1' | 'p2' | null> {
  const m = await loadMatch(code);
  if (!m || m.status !== 'coin_flip') return null;
  const first: 'p1' | 'p2' = Math.random() < 0.5 ? 'p1' : 'p2';
  m.turn = first === 'p1' ? 'X' : 'O';
  m.status = 'active';
  m.board = createEmptyBoard(m.boardSize);
  m.roundNumber = m.roundNumber || 1;
  await updateMatchStatus(m.id, 'active');
  scheduleMoveTimer(io, m);
  await saveMatch(m);
  io.to(roomName(m.code)).emit('match:coinFlipResult', { first });
  io.to(roomName(m.code)).emit('match:state', toPublicState(m));
  return first;
}

/**
 * Schedule the coin flip after a short delay so the client can show the
 * flip animation while the result is on the wire.
 */
function scheduleCoinFlip(io: IO, code: string, delayMs = 1500): void {
  setTimeout(() => {
    void triggerCoinFlip(io, code).catch((err) =>
      console.error('triggerCoinFlip failed', err),
    );
  }, delayMs);
}

/**
 * After a round ends in a multi-round series, transition the match back
 * to coin_flip and let the server drive the next flip.
 */
async function scheduleNextRound(io: IO, code: string, delayMs = 3000): Promise<void> {
  setTimeout(async () => {
    const current = await loadMatch(code);
    if (!current || current.status !== 'active') return;
    current.roundNumber++;
    current.board = createEmptyBoard(current.boardSize);
    current.status = 'coin_flip';
    current.moveDeadline = null;
    await saveMatch(current);
    io.to(roomName(current.code)).emit('match:state', toPublicState(current));
    scheduleCoinFlip(io, current.code);
  }, delayMs);
}

/**
 * Central match-finishing routine. Updates state, persists, emits events,
 * updates user stats (only when both players are registered — guests don't affect stats).
 */
async function finishMatch(
  io: IO,
  m: LiveMatch,
  winnerSide: 'p1' | 'p2' | null,
  reason: string,
): Promise<void> {
  clearMoveTimer(m.code);
  clearDisconnectTimer(m.code, 'p1');
  clearDisconnectTimer(m.code, 'p2');
  rematchOffers.delete(m.code);
  m.status = 'finished';
  if (winnerSide === null) {
    m.result = 'draw';
    m.winnerUserId = null;
  } else {
    m.result = winnerSide === 'p1' ? 'p1_win' : 'p2_win';
    m.winnerUserId = winnerSide === 'p1' ? m.p1.userId : m.p2?.userId ?? null;
  }
  m.endReason = reason;
  m.moveDeadline = null;
  await saveMatch(m);
  await finalizeMatch(m);

  // Stats: only count if BOTH players are registered users (guests excluded)
  const p1Id = m.p1.userId;
  const p2Id = m.p2?.userId ?? null;
  if (p1Id && p2Id) {
    if (winnerSide === null) {
      await applyMatchResult(p1Id, 'draw');
      await applyMatchResult(p2Id, 'draw');
    } else if (winnerSide === 'p1') {
      await applyMatchResult(p1Id, 'win');
      await applyMatchResult(p2Id, 'loss');
    } else {
      await applyMatchResult(p2Id, 'win');
      await applyMatchResult(p1Id, 'loss');
    }
  }

  io.to(roomName(m.code)).emit('match:finished', {
    winnerSide,
    reason,
    state: toPublicState(m),
  });
}
