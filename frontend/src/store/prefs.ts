import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Prefs {
  soundEnabled: boolean;
  volume: number; // 0..1
  highContrast: boolean;
  guestName: string;
  guestAvatarId: number;
  languageChosen: boolean;
  setSound: (v: boolean) => void;
  setVolume: (v: number) => void;
  setHighContrast: (v: boolean) => void;
  setGuestName: (v: string) => void;
  setGuestAvatar: (v: number) => void;
  setLanguageChosen: (v: boolean) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      soundEnabled: true,
      volume: 0.6,
      highContrast: false,
      guestName: '',
      guestAvatarId: 0,
      languageChosen: false,
      setSound: (v) => set({ soundEnabled: v }),
      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
      setHighContrast: (v) => set({ highContrast: v }),
      setGuestName: (v) => set({ guestName: v }),
      setGuestAvatar: (v) => set({ guestAvatarId: v }),
      setLanguageChosen: (v) => set({ languageChosen: v }),
    }),
    { name: 'neon-xo-prefs' },
  ),
);
