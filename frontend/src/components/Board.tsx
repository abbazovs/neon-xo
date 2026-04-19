import type { FC } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Board as BoardType, BoardSize } from '../types';

interface Props {
  board: BoardType;
  size: BoardSize;
  winLine: number[] | null;
  canMove: boolean;
  onMove: (index: number) => void;
  mySide: 'p1' | 'p2' | null;
}

/**
 * The game board. Cells are buttons when it's your turn, divs otherwise.
 * Wins are highlighted by drawing a glowing line over the winning cells
 * and pulsing those cells.
 */
export const Board: FC<Props> = ({ board, size, winLine, canMove, onMove, mySide }) => {
  const gridCols = size === 3 ? 'grid-cols-3' : size === 4 ? 'grid-cols-4' : 'grid-cols-5';
  const cellSize = size === 3 ? 'h-24 md:h-28' : size === 4 ? 'h-16 md:h-24' : 'h-14 md:h-20';

  const winSet = new Set(winLine ?? []);

  return (
    <div
      className={`grid ${gridCols} gap-2 md:gap-3 w-full max-w-md mx-auto`}
      role="grid"
      aria-label={`${size} by ${size} board`}
    >
      {board.map((cell, i) => {
        const empty = cell === null;
        const inWin = winSet.has(i);
        const clickable = empty && canMove;
        const Tag = clickable ? motion.button : motion.div;
        return (
          <Tag
            key={i}
            {...(clickable
              ? {
                  onClick: () => onMove(i),
                  whileHover: { scale: 1.04 },
                  whileTap: { scale: 0.96 },
                  'aria-label': `Cell ${i + 1}`,
                }
              : { 'aria-label': cell ? `Cell ${i + 1} ${cell}` : `Cell ${i + 1} empty` })}
            className={[
              cellSize,
              'relative flex items-center justify-center rounded-md border transition-all',
              'font-display text-4xl md:text-5xl',
              empty
                ? clickable
                  ? 'border-cyan-neon/30 bg-bg-soft/60 hover:border-cyan-neon hover:bg-cyan-neon/10 hover:shadow-neon-cyan cursor-pointer'
                  : 'border-ink-faint/20 bg-bg-soft/40 cursor-not-allowed'
                : cell === 'X'
                  ? 'border-cyan-neon/70 bg-cyan-neon/5'
                  : 'border-magenta-neon/70 bg-magenta-neon/5',
              inWin && 'animate-pulse-neon',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <AnimatePresence>
              {cell && (
                <motion.span
                  key={cell + i}
                  initial={{ scale: 0, rotate: -45, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className={cell === 'X' ? 'neon-cyan' : 'neon-magenta'}
                  aria-hidden
                >
                  {cell === 'X' ? '×' : '○'}
                </motion.span>
              )}
            </AnimatePresence>
          </Tag>
        );
      })}
    </div>
  );
};
