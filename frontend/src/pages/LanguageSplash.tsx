import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { usePrefs } from '../store/prefs';
import { Logo } from '../components/Logo';
import { playSound } from '../lib/sound';

const languages = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uz', label: "O'zbekcha", flag: '🇺🇿' },
];

export const LanguageSplash: FC = () => {
  const { t, i18n } = useTranslation();
  const { setLanguageChosen } = usePrefs();

  const pick = (code: string) => {
    playSound('click');
    void i18n.changeLanguage(code);
    localStorage.setItem('neon-xo-lang', code);
    setLanguageChosen(true);
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md text-center"
      >
        <div className="mb-10 flex justify-center">
          <Logo size="lg" />
        </div>
        <h1 className="font-display text-xl uppercase tracking-wider text-ink mb-2">
          {t('language.choose')}
        </h1>
        <p className="text-ink-dim mb-8">{t('language.chooseSub')}</p>
        <div className="flex flex-col gap-3">
          {languages.map((l, i) => (
            <motion.button
              key={l.code}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              onClick={() => pick(l.code)}
              className="btn-primary flex items-center justify-center gap-4 py-4 text-base"
            >
              <span className="text-2xl" aria-hidden>
                {l.flag}
              </span>
              <span>{l.label}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
