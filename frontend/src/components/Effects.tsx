import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export const Confetti: FC<{ count?: number }> = ({ count = 40 }) => {
  const colors = ['#00f0ff', '#ff2bd1', '#b36bff', '#00ffa3', '#ffcc00'];
  const pieces = Array.from({ length: count }).map((_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 1.8 + Math.random() * 1.4,
    rotate: Math.random() * 720,
    size: 6 + Math.random() * 6,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-50" aria-hidden>
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, x: `${p.left}vw`, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: p.rotate, opacity: [1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 8px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
};

interface FloatingEmojiProps {
  emoji: string;
  side: 'left' | 'right';
}

export const FloatingEmoji: FC<FloatingEmojiProps> = ({ emoji, side }) => (
  <motion.div
    initial={{ opacity: 0, y: 0, scale: 0.7 }}
    animate={{ opacity: [0, 1, 1, 0], y: -120, scale: 1.2 }}
    transition={{ duration: 2, ease: 'easeOut' }}
    className="absolute text-4xl md:text-5xl pointer-events-none select-none"
    style={{
      [side]: 20,
      bottom: 60,
    }}
  >
    {emoji}
  </motion.div>
);

interface ShareSheetProps {
  url: string;
  text: string;
  onClose: () => void;
}

export const ShareSheet: FC<ShareSheetProps> = ({ url, text, onClose }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'NEON XO', text, url });
      } catch {
        /* user cancelled */
      }
    } else {
      copy();
    }
  };

  const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="card w-full max-w-md m-4 p-5 space-y-3"
        >
          <h3 className="font-display uppercase text-lg neon-cyan mb-2">{t('match.share')}</h3>
          <div className="bg-bg-soft rounded-md p-3 font-mono text-xs text-ink-dim break-all border border-ink-faint/20">
            {url}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copy} className="btn-primary">
              {copied ? t('match.copied') : t('match.copy')}
            </button>
            <button onClick={shareNative} className="btn-secondary">
              {t('match.share')}
            </button>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-center"
            >
              WhatsApp
            </a>
            <a
              href={tg}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-center"
            >
              Telegram
            </a>
          </div>
          <button onClick={onClose} className="btn-ghost w-full mt-2">
            {t('common.close')}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
