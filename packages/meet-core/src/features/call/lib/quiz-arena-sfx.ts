'use client';

/**
 * Short, quiet Quiz Arena cues synthesized with Web Audio, so no audio asset
 * ships. Every cue is skipped when the player turned sound effects off or
 * prefers reduced motion, and it fails silently without an AudioContext.
 */
type Tone = {
  frequency: number;
  start: number;
  duration: number;
  type?: OscillatorType;
};

let context: AudioContext | null = null;

function audioContext() {
  if (context) return context;
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

export function quizArenaSfxAllowed(sfxEnabled: boolean) {
  if (!sfxEnabled || typeof window === 'undefined') return false;
  try {
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

function play(sfxEnabled: boolean, tones: Tone[]) {
  if (!quizArenaSfxAllowed(sfxEnabled)) return false;
  const ctx = audioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    for (const tone of tones) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = tone.type ?? 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.start);
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.08, now + tone.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + tone.start + tone.duration
      );
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(now + tone.start);
      oscillator.stop(now + tone.start + tone.duration + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}

export const playBuzzCue = (sfxEnabled: boolean) =>
  play(sfxEnabled, [
    { frequency: 520, start: 0, duration: 0.12, type: 'triangle' },
  ]);

export const playCorrectCue = (sfxEnabled: boolean) =>
  play(sfxEnabled, [
    { frequency: 660, start: 0, duration: 0.12 },
    { frequency: 880, start: 0.1, duration: 0.18 },
  ]);

export const playWrongCue = (sfxEnabled: boolean) =>
  play(sfxEnabled, [
    { frequency: 330, start: 0, duration: 0.14, type: 'triangle' },
    { frequency: 262, start: 0.12, duration: 0.2, type: 'triangle' },
  ]);

export const playFinalRoundCue = (sfxEnabled: boolean) =>
  play(sfxEnabled, [
    { frequency: 523, start: 0, duration: 0.14 },
    { frequency: 659, start: 0.12, duration: 0.14 },
    { frequency: 784, start: 0.24, duration: 0.24 },
  ]);
