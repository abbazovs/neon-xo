import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface Props {
  result: 'p1' | 'p2' | null; // null while still flipping
  onComplete?: () => void;
}

/**
 * 3D-ish coin flip. Rotates 4x, then lands on result face.
 * Cyan face = P1 (X), Magenta face = P2 (O).
 */
export const CoinFlip: FC<Props> = ({ result, onComplete }) => {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (result && !done) {
      const timer = setTimeout(() => {
        setDone(true);
        onComplete?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [result, done, onComplete]);

  const faceAngle = result === 'p2' ? 1440 + 180 : result ? 1440 : 0;

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-display uppercase tracking-wider text-ink-dim mb-8"
      >
        {t('match.coinFlip')}
      </motion.p>
      <div className="relative" style={{ perspective: 800 }}>
        <motion.div
          initial={{ rotateY: 0 }}
          animate={{ rotateY: result ? faceAngle : [0, 360, 720, 1080] }}
          transition={
            result
              ? { duration: 1.6, ease: [0.2, 0.8, 0.2, 1] }
              : { duration: 1.2, repeat: Infinity, ease: 'linear' }
          }
          style={{ transformStyle: 'preserve-3d' }}
          className="w-32 h-32 relative"
        >
          {/* Cyan face = P1 (X) */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-cyan-neon shadow-neon-cyan bg-bg-soft"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="text-5xl font-display font-black neon-cyan">×</span>
          </div>
          {/* Magenta face = P2 (O) */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-magenta-neon shadow-neon-magenta bg-bg-soft"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="text-5xl font-display font-black neon-magenta">○</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
