import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Board } from '../components/Board';
import { CoinFlip } from '../components/CoinFlip';
import { Confetti, FloatingEmoji, ShareSheet } from '../components/Effects';
import { Avatar } from '../components/Avatar';
import { getSocket } from '../lib/socket';
import { playSound, vibrate } from '../lib/sound';
import { useAuth } from '../store/auth';
import { usePrefs } from '../store/prefs';
import type { PublicMatchState } from '../types';

const REACTIONS = ['🔥', '😂', '😭', '👏'];

export const Match: FC = () => {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { guestName, guestAvatarId } = usePrefs();

  const [state, setState] = useState<PublicMatchState | null>(null);
  const [mySide, setMySide] = useState<'p1' | 'p2' | null>(null);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [coinResult, setCoinResult] = useState<'p1' | 'p2' | null>(null);
  const [rematchOfferedBy, setRematchOfferedBy] = useState<'p1' | 'p2' | null>(null);
  const [iOfferedRematch, setIOfferedRematch] = useState(false);
  const [showWinLine, setShowWinLine] = useState<number[] | null>(null);
  const [floatingEmoji, setFloatingEmoji] = useState<{
    side: 'left' | 'right';
    emoji: string;
    key: number;
  } | null>(null);
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const [disconnectMessage, setDisconnectMessage] = useState<string | null>(null);

  const emojiKeyRef = useRef(0);

  const shareUrl = `${window.location.origin}/match/${code}`;
  const inMatch = state !== null;
  const isMyTurn =
    state?.status === 'active' &&
    ((mySide === 'p1' && state.turn === 'X') || (mySide === 'p2' && state.turn === 'O'));

  // Join match on mount
  useEffect(() => {
    const socket = getSocket();

    const joinPayload: { code: string; guestName?: string; guestAvatarId?: number } = { code };
    if (!user) {
      joinPayload.guestName = guestName || 'Guest';
      joinPayload.guestAvatarId = guestAvatarId;
    }

    socket.emit(
      'match:join',
      joinPayload,
      (
        res:
          | { ok: true; side: 'p1' | 'p2'; state: PublicMatchState }
          | { ok: false; error: string },
      ) => {
        if (res.ok) {
          setState(res.state);
          setMySide(res.side);
        } else {
          setError(res.error);
        }
      },
    );

    const onState = (s: PublicMatchState) => {
      setState(s);
      // Clear rematch offers on new state after round reset
      if (s.status === 'coin_flip') {
        setShowWinLine(null);
        setCoinResult(null);
      }
    };
    const onMove = ({ state: s }: { state: PublicMatchState }) => {
      setState(s);
      playSound('move');
      vibrate(30);
    };
    const onCoin = ({ first }: { first: 'p1' | 'p2' }) => {
      setCoinResult(first);
      playSound('click');
    };
    const onRoundEnd = ({
      winnerSide,
      draw,
      winLine,
      state: s,
    }: {
      winnerSide: 'p1' | 'p2' | null;
      draw: boolean;
      winLine: number[] | null;
      state: PublicMatchState;
    }) => {
      setState(s);
      setShowWinLine(winLine);
      if (draw) playSound('draw');
      else if (winnerSide === mySide) {
        playSound('win');
        vibrate([60, 40, 60]);
      } else {
        playSound('lose');
        vibrate(120);
      }
    };
    const onFinished = ({
      reason,
      state: s,
    }: {
      reason: string;
      state: PublicMatchState;
    }) => {
      setState(s);
      if (reason === 'disconnect') setDisconnectMessage(t('match.opponentLeft'));
    };
    const onEmoji = ({ by, emoji }: { by: 'p1' | 'p2'; emoji: string }) => {
      const side = by === mySide ? 'left' : 'right';
      emojiKeyRef.current++;
      setFloatingEmoji({ side, emoji, key: emojiKeyRef.current });
      setTimeout(() => setFloatingEmoji(null), 2000);
    };
    const onRematchOffered = ({ by }: { by: 'p1' | 'p2' }) => {
      setRematchOfferedBy(by);
    };

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('match:state', onState);
    socket.on('match:moveMade', onMove);
    socket.on('match:coinFlipResult', onCoin);
    socket.on('match:roundEnd', onRoundEnd);
    socket.on('match:finished', onFinished);
    socket.on('match:emoji', onEmoji);
    socket.on('match:rematchOffered', onRematchOffered);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('match:state', onState);
      socket.off('match:moveMade', onMove);
      socket.off('match:coinFlipResult', onCoin);
      socket.off('match:roundEnd', onRoundEnd);
      socket.off('match:finished', onFinished);
      socket.off('match:emoji', onEmoji);
      socket.off('match:rematchOffered', onRematchOffered);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Handle entering coin_flip phase — P1 auto-triggers
  useEffect(() => {
    if (state?.status === 'coin_flip' && mySide === 'p1' && !coinResult) {
      const socket = getSocket();
      socket.emit('match:coinFlip', { code }, () => {});
    }
  }, [state?.status, mySide, coinResult, code]);

  // Move deadline timer display
  useEffect(() => {
    if (!state?.moveDeadline) {
      setTimerLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((state.moveDeadline! - Date.now()) / 1000));
      setTimerLeft(left);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state?.moveDeadline]);

  const doMove = (index: number) => {
    if (!state || !isMyTurn) return;
    const socket = getSocket();
    socket.emit('match:move', { code, index }, (res: { ok: true } | { ok: false; error: string }) => {
      if (!res.ok) playSound('error');
    });
  };

  const sendEmoji = (emoji: string) => {
    const socket = getSocket();
    socket.emit('match:emoji', { code, emoji });
    emojiKeyRef.current++;
    setFloatingEmoji({ side: 'left', emoji, key: emojiKeyRef.current });
    setTimeout(() => setFloatingEmoji(null), 2000);
  };

  const doSurrender = () => {
    const socket = getSocket();
    socket.emit('match:surrender', { code }, () => {});
    setShowSurrenderConfirm(false);
  };

  const cancelMatch = () => {
    const socket = getSocket();
    socket.emit('match:cancel', { code }, () => {
      nav('/app');
    });
  };

  const requestRematch = () => {
    const socket = getSocket();
    socket.emit('match:rematch', { code }, () => {});
    setIOfferedRematch(true);
  };

  const goHome = () => nav('/app');

  // ERROR STATE
  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6">
        <div className="card max-w-md text-center">
          <h1 className="font-display uppercase text-xl neon-magenta mb-4">Error</h1>
          <p className="text-ink-dim mb-6">{error}</p>
          <button className="btn-primary" onClick={goHome}>
            {t('match.home')}
          </button>
        </div>
      </div>
    );
  }

  // LOADING
  if (!state) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="font-display uppercase text-ink-dim animate-pulse-neon">Loading...</div>
      </div>
    );
  }

  // WAITING FOR OPPONENT
  if (state.status === 'waiting') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6">
        <div className="card max-w-md w-full text-center p-8">
          <h1 className="font-display uppercase text-xl neon-cyan animate-pulse-neon mb-4">
            {t('match.waiting')}
          </h1>
          <div className="flex items-center justify-center gap-3 my-6">
            <Avatar id={state.p1.avatarId} size={48} />
            <span className="font-display uppercase tracking-wider neon-cyan">{state.p1.displayName}</span>
          </div>
          <div className="flex gap-3 justify-center mt-6">
            <button className="btn-primary" onClick={() => setShowShare(true)}>
              {t('match.share')}
            </button>
            <button className="btn-ghost" onClick={cancelMatch}>
              {t('match.cancel')}
            </button>
          </div>
        </div>
        {showShare && (
          <ShareSheet
            url={shareUrl}
            text={`${state.p1.displayName} ${t('app.tagline')}`}
            onClose={() => setShowShare(false)}
          />
        )}
      </div>
    );
  }

  // COIN FLIP
  if (state.status === 'coin_flip') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6">
        <CoinFlip result={coinResult} />
      </div>
    );
  }

  // ACTIVE / FINISHED
  const youWon = state.status === 'finished' && state.winnerSide === mySide;
  const youLost = state.status === 'finished' && state.winnerSide && state.winnerSide !== mySide;
  const draw = state.status === 'finished' && state.result === 'draw';

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 md:p-8 relative overflow-hidden">
      {/* Connection lost banner */}
      {!connected && (
        <div className="fixed top-0 left-0 right-0 bg-magenta-neon/20 border-b border-magenta-neon/50 text-center py-2 z-40 font-display uppercase text-sm neon-magenta">
          {t('match.connectionLost')}
        </div>
      )}

      {/* Player bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <PlayerCard player={state.p1} isP1 active={state.turn === 'X' && state.status === 'active'} score={state.p1Score} />
        <div className="font-display text-ink-dim text-center">
          <div className="text-xs uppercase tracking-wider">
            {t('match.round', { n: state.roundNumber })}
          </div>
          {state.format !== 'single' && (
            <div className="text-xs">
              {t('match.series', { p1: state.p1Score, p2: state.p2Score })}
            </div>
          )}
          {timerLeft !== null && state.status === 'active' && (
            <div
              className={`font-display text-2xl mt-1 ${
                timerLeft <= 5 ? 'neon-magenta' : 'neon-cyan'
              }`}
            >
              {timerLeft}
            </div>
          )}
        </div>
        <PlayerCard
          player={state.p2}
          isP1={false}
          active={state.turn === 'O' && state.status === 'active'}
          score={state.p2Score}
        />
      </div>

      {/* Turn indicator */}
      {state.status === 'active' && (
        <p className="text-center font-display uppercase text-sm text-ink-dim mb-4">
          {isMyTurn ? (
            <span className={mySide === 'p1' ? 'neon-cyan' : 'neon-magenta'}>
              {t('match.yourTurn')}
            </span>
          ) : (
            t('match.opponentTurn')
          )}
        </p>
      )}

      {/* Board */}
      <div className="flex-1 flex items-center justify-center">
        <Board
          board={state.board}
          size={state.boardSize}
          winLine={showWinLine}
          canMove={isMyTurn}
          onMove={doMove}
          mySide={mySide}
        />
      </div>

      {/* Emoji reactions bar */}
      {state.status === 'active' && (
        <div className="flex justify-center gap-3 mt-4">
          {REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => sendEmoji(e)}
              className="text-2xl md:text-3xl p-2 rounded-full border border-ink-faint/30 hover:border-cyan-neon hover:shadow-neon-soft transition"
              aria-label={`Send ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Surrender button */}
      {state.status === 'active' && (
        <div className="text-center mt-4">
          <button className="btn-ghost text-xs" onClick={() => setShowSurrenderConfirm(true)}>
            {t('match.surrender')}
          </button>
        </div>
      )}

      {/* Floating emoji overlay */}
      <AnimatePresence>
        {floatingEmoji && (
          <FloatingEmoji key={floatingEmoji.key} emoji={floatingEmoji.emoji} side={floatingEmoji.side} />
        )}
      </AnimatePresence>

      {/* Win/lose/draw overlay */}
      <AnimatePresence>
        {state.status === 'finished' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={`card max-w-md w-full text-center p-8 border-2 ${
                youWon
                  ? 'border-cyan-neon shadow-neon-cyan'
                  : youLost
                    ? 'border-magenta-neon shadow-neon-magenta opacity-90'
                    : 'border-ink-faint'
              }`}
            >
              <h1
                className={`font-display uppercase text-3xl md:text-4xl mb-4 ${
                  youWon ? 'neon-cyan' : youLost ? 'neon-magenta' : 'text-ink'
                }`}
              >
                {youWon ? t('match.youWon') : draw ? t('match.draw') : t('match.youLost')}
              </h1>
              {disconnectMessage && (
                <p className="text-ink-dim mb-4 font-body">{disconnectMessage}</p>
              )}
              {state.endReason === 'surrender' && !youWon === false && (
                <p className="text-ink-dim mb-4 font-body">{t('match.reasonSurrender')}</p>
              )}
              {state.endReason === 'timeout' && (
                <p className="text-ink-dim mb-4 font-body">{t('match.reasonTimeout')}</p>
              )}

              {rematchOfferedBy && rematchOfferedBy !== mySide && !iOfferedRematch && (
                <p className="text-cyan-neon mb-3 text-sm animate-pulse">
                  {(rematchOfferedBy === 'p1' ? state.p1 : state.p2)?.displayName ?? '?'} → {t('match.rematch')}
                </p>
              )}
              {iOfferedRematch && !rematchOfferedBy && (
                <p className="text-ink-dim mb-3 text-sm">waiting...</p>
              )}

              <div className="flex flex-col gap-3 mt-6">
                <button className="btn-primary" onClick={requestRematch} disabled={iOfferedRematch}>
                  {t('match.rematch')}
                </button>
                <button className="btn-secondary" onClick={() => setShowShare(true)}>
                  {t('match.inviteAgain')}
                </button>
                <button className="btn-ghost" onClick={goHome}>
                  {t('match.home')}
                </button>
              </div>
            </motion.div>
            {youWon && <Confetti />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Surrender confirm */}
      <AnimatePresence>
        {showSurrenderConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
            onClick={() => setShowSurrenderConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="card max-w-sm w-full p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-ink mb-6 font-body">{t('match.surrenderConfirm')}</p>
              <div className="flex gap-3">
                <button className="btn-ghost flex-1" onClick={() => setShowSurrenderConfirm(false)}>
                  {t('match.surrenderNo')}
                </button>
                <button className="btn-secondary flex-1" onClick={doSurrender}>
                  {t('match.surrenderYes')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showShare && (
        <ShareSheet
          url={shareUrl}
          text={`${state.p1.displayName} vs ${state.p2?.displayName ?? '...'}`}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
};

const PlayerCard: FC<{
  player: PublicMatchState['p1'] | PublicMatchState['p2'] | null;
  isP1: boolean;
  active: boolean;
  score: number;
}> = ({ player, isP1, active, score }) => {
  if (!player) {
    return (
      <div className="flex-1 flex flex-col items-center gap-1 opacity-40">
        <div className="w-12 h-12 rounded-md border-2 border-dashed border-ink-faint/40" />
        <span className="text-xs text-ink-faint uppercase">...</span>
      </div>
    );
  }
  const color = isP1 ? 'cyan' : 'magenta';
  return (
    <div
      className={`flex-1 flex flex-col items-center gap-1 transition ${
        active ? 'scale-110' : ''
      } ${!player.connected ? 'opacity-50' : ''}`}
    >
      <div
        className={`rounded-md p-1 border-2 transition ${
          active
            ? color === 'cyan'
              ? 'border-cyan-neon shadow-neon-cyan'
              : 'border-magenta-neon shadow-neon-magenta'
            : 'border-ink-faint/30'
        }`}
      >
        <Avatar id={player.avatarId} size={44} />
      </div>
      <span
        className={`text-xs md:text-sm font-display uppercase tracking-wider text-center max-w-[120px] truncate ${
          color === 'cyan' ? 'neon-cyan' : 'neon-magenta'
        }`}
      >
        {player.displayName}
      </span>
      <span className="font-display text-lg">{score}</span>
    </div>
  );
};
