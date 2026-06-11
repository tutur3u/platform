'use client';

import {
  useUserBooleanConfig,
  useUserConfig,
} from '@tuturuuu/ui/hooks/use-user-config';
import { useEffect } from 'react';

export const TASK_SOUND_EFFECTS_ENABLED_CONFIG_ID =
  'TASK_SOUND_EFFECTS_ENABLED';
export const TASK_SOUND_EFFECTS_VOLUME_CONFIG_ID = 'TASK_SOUND_EFFECTS_VOLUME';
export const DEFAULT_TASK_SOUND_EFFECTS_VOLUME = 35;

const TASK_SOUND_EFFECT_EVENT = 'tuturuuu:task-sound-effect';
const VALID_TASK_SOUND_CUES = new Set([
  'create',
  'complete',
  'move',
  'update',
  'delete',
] as const);

export type TaskSoundCue = 'create' | 'complete' | 'move' | 'update' | 'delete';

export interface TaskSoundCueOptions {
  cue: TaskSoundCue;
  count?: number;
  intensity?: number;
}

interface TaskSoundPreferences {
  enabled: boolean;
  volume: number;
}

interface NormalizedTaskSoundCueOptions {
  cue: TaskSoundCue;
  count: number;
  intensity: number;
}

type AudioContextConstructor = new () => AudioContext;

let audioContext: AudioContext | null = null;
let preferences: TaskSoundPreferences = {
  enabled: true,
  volume: DEFAULT_TASK_SOUND_EFFECTS_VOLUME,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampTaskSoundEffectsVolume(
  value: number | string | null | undefined
) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TASK_SOUND_EFFECTS_VOLUME;
  return Math.round(clamp(parsed, 0, 100));
}

function normalizeTaskSoundCue(
  input: TaskSoundCue | TaskSoundCueOptions | null | undefined
): NormalizedTaskSoundCueOptions | null {
  const cue = typeof input === 'string' ? input : input?.cue;

  if (!cue || !VALID_TASK_SOUND_CUES.has(cue)) {
    return null;
  }

  const cueOptions =
    input && typeof input === 'object' ? input : ({} as TaskSoundCueOptions);
  const rawCount = cueOptions.count;
  const rawIntensity = cueOptions.intensity;

  return {
    cue,
    count: Math.round(clamp(Number(rawCount) || 1, 1, 24)),
    intensity: clamp(Number(rawIntensity) || 1, 0.35, 2),
  };
}

export function configureTaskSoundEffects({
  enabled,
  volume,
}: {
  enabled?: boolean;
  volume?: number | string | null;
}) {
  preferences = {
    enabled: enabled ?? preferences.enabled,
    volume:
      volume === undefined
        ? preferences.volume
        : clampTaskSoundEffectsVolume(volume),
  };
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const browserWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };

  return window.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

function getAudioContext() {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) return null;

  if (audioContext && audioContext.state !== 'closed') {
    return audioContext;
  }

  try {
    audioContext = new AudioContextCtor();
    return audioContext;
  } catch {
    return null;
  }
}

function resumeAudioContext(context: AudioContext) {
  if (context.state !== 'suspended') return;
  void context.resume().catch(() => undefined);
}

function scheduleGainEnvelope(
  gain: AudioParam,
  startAt: number,
  duration: number,
  peakGain: number,
  attack = 0.01
) {
  const safeGain = Math.max(0.0001, peakGain);

  gain.setValueAtTime(0.0001, startAt);
  gain.exponentialRampToValueAtTime(safeGain, startAt + attack);
  gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
}

function scheduleOscillator({
  context,
  destination,
  type,
  frequency,
  endFrequency,
  startAt,
  duration,
  gain,
}: {
  context: AudioContext;
  destination: AudioNode;
  type: OscillatorType;
  frequency: number;
  endFrequency?: number;
  startAt: number;
  duration: number;
  gain: number;
}) {
  const oscillator = context.createOscillator();
  const amp = context.createGain();
  const finalFrequency = endFrequency ?? frequency;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(20, frequency), startAt);

  if (finalFrequency !== frequency) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, finalFrequency),
      startAt + duration
    );
  }

  scheduleGainEnvelope(amp.gain, startAt, duration, gain);
  oscillator.connect(amp);
  amp.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function scheduleNoiseBurst({
  context,
  destination,
  startAt,
  duration,
  gain,
}: {
  context: AudioContext;
  destination: AudioNode;
  startAt: number;
  duration: number;
  gain: number;
}) {
  const sampleRate = context.sampleRate || 44_100;
  const frameCount = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i += 1) {
    const progress = i / frameCount;
    data[i] = (Math.random() * 2 - 1) * (1 - progress) ** 2;
  }

  const source = context.createBufferSource();
  const amp = context.createGain();

  source.buffer = buffer;
  scheduleGainEnvelope(amp.gain, startAt, duration, gain, 0.004);
  source.connect(amp);
  amp.connect(destination);
  source.start(startAt);
  source.stop(startAt + duration + 0.01);
}

function scheduleCreateCue(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  scale: number
) {
  scheduleNoiseBurst({
    context,
    destination,
    startAt,
    duration: 0.022,
    gain: 0.04 * scale,
  });
  scheduleOscillator({
    context,
    destination,
    type: 'triangle',
    frequency: 560,
    endFrequency: 980,
    startAt,
    duration: 0.1,
    gain: 0.11 * scale,
  });
  scheduleOscillator({
    context,
    destination,
    type: 'sine',
    frequency: 1180,
    endFrequency: 1560,
    startAt: startAt + 0.045,
    duration: 0.15,
    gain: 0.045 * scale,
  });
}

function scheduleCompleteCue(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  scale: number,
  count: number
) {
  const isBulk = count > 1;
  const baseDuration = isBulk ? 0.42 : 0.32;

  for (const [index, frequency] of [392, 523.25, 659.25].entries()) {
    scheduleOscillator({
      context,
      destination,
      type: index === 0 ? 'triangle' : 'sine',
      frequency,
      endFrequency: frequency * 1.035,
      startAt: startAt + index * 0.018,
      duration: baseDuration,
      gain: (index === 0 ? 0.065 : 0.045) * scale,
    });
  }

  if (isBulk) {
    for (const [index, frequency] of [783.99, 1046.5].entries()) {
      scheduleOscillator({
        context,
        destination,
        type: 'sine',
        frequency,
        endFrequency: frequency * 1.025,
        startAt: startAt + 0.11 + index * 0.018,
        duration: 0.32,
        gain: 0.032 * scale,
      });
    }
  }
}

function scheduleMoveCue(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  scale: number
) {
  scheduleOscillator({
    context,
    destination,
    type: 'triangle',
    frequency: 420,
    endFrequency: 610,
    startAt,
    duration: 0.08,
    gain: 0.075 * scale,
  });
  scheduleNoiseBurst({
    context,
    destination,
    startAt: startAt + 0.055,
    duration: 0.018,
    gain: 0.025 * scale,
  });
}

function scheduleUpdateCue(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  scale: number
) {
  scheduleOscillator({
    context,
    destination,
    type: 'sine',
    frequency: 650,
    endFrequency: 760,
    startAt,
    duration: 0.085,
    gain: 0.065 * scale,
  });
  scheduleOscillator({
    context,
    destination,
    type: 'triangle',
    frequency: 980,
    startAt: startAt + 0.035,
    duration: 0.07,
    gain: 0.022 * scale,
  });
}

function scheduleDeleteCue(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  scale: number
) {
  scheduleOscillator({
    context,
    destination,
    type: 'triangle',
    frequency: 250,
    endFrequency: 170,
    startAt,
    duration: 0.16,
    gain: 0.075 * scale,
  });
  scheduleNoiseBurst({
    context,
    destination,
    startAt: startAt + 0.015,
    duration: 0.035,
    gain: 0.018 * scale,
  });
}

export function playTaskSoundCue(
  input: TaskSoundCue | TaskSoundCueOptions | null | undefined
) {
  const cue = normalizeTaskSoundCue(input);
  const volume = clampTaskSoundEffectsVolume(preferences.volume);

  if (!cue || !preferences.enabled || volume <= 0) {
    return;
  }

  const context = getAudioContext();
  if (!context) return;

  resumeAudioContext(context);

  const startAt = context.currentTime + 0.006;
  const masterGain = context.createGain();
  const bulkScale = cue.count > 1 ? Math.min(1.55, 1 + cue.count * 0.06) : 1;
  const scale = clamp((volume / 100) * cue.intensity * bulkScale, 0.05, 1);

  masterGain.gain.setValueAtTime(0.0001, startAt);
  masterGain.gain.linearRampToValueAtTime(scale, startAt + 0.01);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.65);
  masterGain.connect(context.destination);

  switch (cue.cue) {
    case 'create':
      scheduleCreateCue(context, masterGain, startAt, scale);
      break;
    case 'complete':
      scheduleCompleteCue(context, masterGain, startAt, scale, cue.count);
      break;
    case 'move':
      scheduleMoveCue(context, masterGain, startAt, scale);
      break;
    case 'update':
      scheduleUpdateCue(context, masterGain, startAt, scale);
      break;
    case 'delete':
      scheduleDeleteCue(context, masterGain, startAt, scale);
      break;
  }
}

export function dispatchTaskSoundCue(
  input: TaskSoundCue | TaskSoundCueOptions
) {
  if (typeof window === 'undefined') return;

  const cue = normalizeTaskSoundCue(input);
  if (!cue) return;

  window.dispatchEvent(
    new CustomEvent<TaskSoundCueOptions>(TASK_SOUND_EFFECT_EVENT, {
      detail: cue,
    })
  );
}

export function TaskSoundEffectsInitializer() {
  const { value: enabled } = useUserBooleanConfig(
    TASK_SOUND_EFFECTS_ENABLED_CONFIG_ID,
    true
  );
  const { data: volume } = useUserConfig(
    TASK_SOUND_EFFECTS_VOLUME_CONFIG_ID,
    String(DEFAULT_TASK_SOUND_EFFECTS_VOLUME)
  );

  useEffect(() => {
    configureTaskSoundEffects({ enabled, volume });
  }, [enabled, volume]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSoundCue = (event: Event) => {
      playTaskSoundCue(
        (event as CustomEvent<TaskSoundCueOptions>).detail ?? null
      );
    };

    window.addEventListener(TASK_SOUND_EFFECT_EVENT, handleSoundCue);
    return () => {
      window.removeEventListener(TASK_SOUND_EFFECT_EVENT, handleSoundCue);
    };
  }, []);

  return null;
}

export function __resetTaskSoundEffectsForTests() {
  audioContext = null;
  preferences = {
    enabled: true,
    volume: DEFAULT_TASK_SOUND_EFFECTS_VOLUME,
  };
}
