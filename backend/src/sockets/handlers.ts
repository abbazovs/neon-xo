import type { Server, Socket } from 'socket.io';
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
  saveMatch,
  type LiveMatch,
} from '../game/state.js';
import { roomName, toPublicState } from './helpers.js';
import type { ClientToServerEvents, ServerToClientEvents } from './events.js';

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

function sideOfUser(m: LiveMatch, userId: string | null): 'p1' | 'p2' | null {
  if (!userId) return null;
  if (m.p1.userId === userId) return 'p1';
  if (m.p2?.userId === userId) return 'p2';
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
        if (![3, 4, 5].includes(payload.boardSize)) return ack({ ok: false, error: 'Invalid board size' });
        if (!['single', 'bo3', 'bo5'].includes(payload.format))
          return ack({ ok: false, error: 'Invalid format' });
        if (![0, 10, 30].includes(payload.timerSeconds))
          return ack({ ok: false, error: 'Invalid timer' });

        let displayName: string;
        let avatarId: number;
        if (socket.data.userId) {
          displayName = socket.data.username!;
          avatarId = socket.data.avatarId;
        } else {
          const guestName = (payload.guestName ?? '').trim();
          if (guestName.length < 1 || guestName.length > 40)
            return ack({ ok: false, error: 'Invalid guest name' });
          displayName = guestName;
          avatarId = payload.guestAvatarId ?? 0;
        }

        const expiryMs = env.MATCH_INVITE_EXPIRY_MINUTES * 60 * 1000;
        const m = createLiveMatch(
          {
            boardSize: payload.boardSize,
            format: payload.format,
            timerSeconds: payload.timerSeconds,
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
        const m = await loadMatch(payload.code);
        if (!m) return ack({ ok: false, error: 'Match not found' });
        if (Date.now() > m.expiresAt && m.status === 'waiting') {
          await deleteMatch(m.code);
          return ack({ ok: false, error: 'Invite expired' });
        }

        // If user is already P1 (reconnecting)
        if (socket.data.userId && m.p1.userId === socket.data.userId) {
          m.p1.socketId = socket.id;
          m.p1.connected = true;
          await saveMatch(m);
          socket.join(roomName(m.code));
          socket.data.activeMatchCode = m.code;
          return ack({ ok: true, side: 'p1', state: toPublicState(m) });
        }
        // If user is already P2 (reconnecting)
        if (socket.data.userId && m.p2?.userId === socket.data.userId) {
          m.p2.socketId = socket.id;
          m.p2.connected = true;
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
          const guestName = (payload.guestName ?? '').trim();
          if (guestName.length < 1 || guestName.length > 40)
            return ack({ ok: false, error: 'Invalid guest name' });
          if (guestName.toLowerCase() === m.p1.displayName.toLowerCase())
            return ack({ ok: false, error: 'Name already taken in this match' });
          displayName = guestName;
          avatarId = payload.guestAvatarId ?? 1;
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
        ack({ ok: true, side: 'p2', state: toPublicState(m) });
      } catch (err) {
        console.error('match:join error', err);
        ack({ ok: false, error: 'Server error' });
      }
    });

    socket.on('match:coinFlip', async (payload, ack) => {
      const m = await loadMatch(payload.code);
      if (!m) return ack({ ok: false, error: 'Match not found' });
      if (m.status !== 'coin_flip') return ack({ ok: false, error: 'Not in coin-flip phase' });
      // Only p1 triggers it (client enforced); server just computes.
      if (sideOf(m, socket.id) !== 'p1') return ack({ ok: false, error: 'Only host triggers coin flip' });
      const first: 'p1' | 'p2' = Math.random() < 0.5 ? 'p1' : 'p2';
      m.turn = first === 'p1' ? 'X' : 'O';
      m.status = 'active';
      m.board = createEmptyBoard(m.boardSize);
      m.roundNumber = m.roundNumber || 1;
      await saveMatch(m);
      await updateMatchStatus(m.id, 'active');
      io.to(roomName(m.code)).emit('match:coinFlipResult', { first });
      io.to(roomName(m.code)).emit('match:state', toPublicState(m));
      scheduleMoveTimer(io, m);
      await saveMatch(m);
      ack({ ok: true, first });
    });

    socket.on('match:move', async (payload, ack) => {
      const m = await loadMatch(payload.code);
      if (!m) return ack({ ok: false, error: 'Match not found' });
      if (m.status !== 'active') return ack({ ok: false, error: 'Match not active' });
      const side = sideOf(m, socket.id);
      if (!side) return ack({ ok: false, error: 'Not a player in this match' });
      const player = side === 'p1' ? 'X' : 'O';
      const res = applyMove(m.board, payload.index, player, m.turn, m.boardSize);
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
          // Next round — reset board, new coin flip phase
          setTimeout(async () => {
            const current = await loadMatch(m.code);
            if (!current || current.status !== 'active') return;
            current.roundNumber++;
            current.board = createEmptyBoard(current.boardSize);
            current.status = 'coin_flip';
            current.moveDeadline = null;
            await saveMatch(current);
            io.to(roomName(current.code)).emit('match:state', toPublicState(current));
          }, 3000);
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
          setTimeout(async () => {
            const current = await loadMatch(m.code);
            if (!current || current.status !== 'active') return;
            current.roundNumber++;
            current.board = createEmptyBoard(current.boardSize);
            current.status = 'coin_flip';
            current.moveDeadline = null;
            await saveMatch(current);
            io.to(roomName(current.code)).emit('match:state', toPublicState(current));
          }, 3000);
        }
      } else {
        m.turn = otherPlayer(m.turn);
        await saveMatch(m);
        scheduleMoveTimer(io, m);
        await saveMatch(m);
        io.to(roomName(m.code)).emit('match:moveMade', {
          index: payload.index,
          by: player,
          state: toPublicState(m),
        });
      }
    });

    socket.on('match:surrender', async (payload, ack) => {
      const m = await loadMatch(payload.code);
      if (!m) return ack({ ok: false, error: 'Match not found' });
      if (m.status !== 'active' && m.status !== 'coin_flip')
        return ack({ ok: false, error: 'Match not active' });
      const side = sideOf(m, socket.id);
      if (!side) return ack({ ok: false, error: 'Not a player' });
      await finishMatch(io, m, side === 'p1' ? 'p2' : 'p1', 'surrender');
      ack({ ok: true });
    });

    socket.on('match:cancel', async (payload, ack) => {
      const m = await loadMatch(payload.code);
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

    // Rematch: simply returns both players to coin-flip phase with scores reset.
    // Both players must click "rematch" — we track offers via a simple flag.
    const rematchOffers = new Map<string, Set<'p1' | 'p2'>>();
    socket.on('match:rematch', async (payload, ack) => {
      const m = await loadMatch(payload.code);
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
      }
      ack({ ok: true });
    });

    socket.on('match:emoji', async (payload) => {
      const m = await loadMatch(payload.code);
      if (!m) return;
      const side = sideOf(m, socket.id);
      if (!side) return;
      const allowed = ['🔥', '😂', '😭', '👏'];
      if (!allowed.includes(payload.emoji)) return;
      socket.to(roomName(m.code)).emit('match:emoji', { by: side, emoji: payload.emoji });
    });

    socket.on('quickmatch:enqueue', async (ack) => {
      if (!socket.data.userId) return ack({ ok: false, error: 'Login required for Quick Match' });
      await enqueueQuickMatch(socket.data.userId, socket.id);
      const pair = await dequeueQuickMatchPair();
      if (pair) {
        // Build a match with default settings: 3x3, single, no timer
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
        // Join both sockets to the room
        io.sockets.sockets.get(pair.a.socketId)?.join(roomName(m.code));
        io.sockets.sockets.get(pair.b.socketId)?.join(roomName(m.code));
        io.to(pair.a.socketId).emit('quickmatch:paired', { code: m.code });
        io.to(pair.b.socketId).emit('quickmatch:paired', { code: m.code });
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
        // Mark side as disconnected, check if opponent also disconnected
        if (side === 'p1') m.p1.connected = false;
        else if (m.p2) m.p2.connected = false;
        await saveMatch(m);

        const bothGone = !m.p1.connected && (!m.p2 || !m.p2.connected);
        if (bothGone) {
          // Both disconnected simultaneously → draw
          clearMoveTimer(m.code);
          await finishMatch(io, m, null, 'both_disconnect');
          return;
        }

        // Opponent auto-wins immediately (per spec)
        clearMoveTimer(m.code);
        const winnerSide = side === 'p1' ? 'p2' : 'p1';
        await finishMatch(io, m, winnerSide, 'disconnect');
      }
    });
  });
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
