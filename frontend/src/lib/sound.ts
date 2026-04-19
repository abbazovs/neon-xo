import { usePrefs } from '../store/prefs';

/**
 * Sound manager — generates short cyberpunk SFX via the Web Audio API
 * so we don't ship any audio files. Respects the prefs store (on/off + volume).
 */

type SoundName = 'click' | 'move' | 'win' | 'lose' | 'draw' | 'notify' | 'error';

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function beep(freq: number, duration: number, type: OscillatorType = 'square', vol = 1): void {
  const { soundEnabled, volume } = usePrefs.getState();
  if (!soundEnabled) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume * vol * 0.25, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function sweep(fromFreq: number, toFreq: number, duration: number, type: OscillatorType = 'sawtooth'): void {
  const { soundEnabled, volume } = usePrefs.getState();
  if (!soundEnabled) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromFreq, now);
  osc.frequency.exponentialRampToValueAtTime(toFreq, now + duration);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume * 0.2, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export function playSound(name: SoundName): void {
  switch (name) {
    case 'click':
      beep(880, 0.06, 'square', 0.4);
      break;
    case 'move':
      beep(520, 0.08, 'triangle', 0.8);
      setTimeout(() => beep(780, 0.06, 'triangle', 0.6), 40);
      break;
    case 'win':
      sweep(440, 1320, 0.4, 'sawtooth');
      setTimeout(() => beep(1760, 0.2, 'sine', 0.9), 150);
      break;
    case 'lose':
      sweep(660, 120, 0.6, 'sawtooth');
      break;
    case 'draw':
      beep(660, 0.15, 'triangle');
      setTimeout(() => beep(440, 0.2, 'triangle'), 150);
      break;
    case 'notify':
      beep(1200, 0.08, 'sine');
      setTimeout(() => beep(1800, 0.08, 'sine'), 80);
      break;
    case 'error':
      beep(220, 0.15, 'square');
      break;
  }
}

export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* no-op */
    }
  }
}
