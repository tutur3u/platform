/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetTaskSoundEffectsForTests,
  configureTaskSoundEffects,
  dispatchTaskSoundCue,
  playTaskSoundCue,
} from './task-sound-effects';

class MockAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class MockOscillatorNode {
  type: OscillatorType = 'sine';
  frequency = new MockAudioParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockGainNode {
  gain = new MockAudioParam();
  connect = vi.fn();
}

class MockAudioBuffer {
  private readonly data: Float32Array;

  constructor(frameCount: number) {
    this.data = new Float32Array(frameCount);
  }

  getChannelData = vi.fn(() => this.data);
}

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];

  currentTime = 1;
  destination = {} as AudioDestinationNode;
  sampleRate = 44_100;
  state: AudioContextState = 'running';
  oscillators: MockOscillatorNode[] = [];
  gains: MockGainNode[] = [];
  bufferSources: MockAudioBufferSourceNode[] = [];
  buffers: MockAudioBuffer[] = [];
  resume = vi.fn(() => Promise.resolve());

  constructor() {
    MockAudioContext.instances.push(this);
  }

  createOscillator() {
    const oscillator = new MockOscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  createGain() {
    const gain = new MockGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBuffer(_channels: number, frameCount: number) {
    const buffer = new MockAudioBuffer(frameCount);
    this.buffers.push(buffer);
    return buffer as unknown as AudioBuffer;
  }

  createBufferSource() {
    const source = new MockAudioBufferSourceNode();
    this.bufferSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}

function installMockAudioContext() {
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: MockAudioContext,
  });
  Object.defineProperty(window, 'webkitAudioContext', {
    configurable: true,
    value: undefined,
  });
}

describe('task sound effects', () => {
  beforeEach(() => {
    MockAudioContext.instances = [];
    __resetTaskSoundEffectsForTests();
    installMockAudioContext();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetTaskSoundEffectsForTests();
  });

  it('no-ops without window', () => {
    vi.stubGlobal('window', undefined);

    expect(() => dispatchTaskSoundCue('create')).not.toThrow();
    expect(() => playTaskSoundCue('create')).not.toThrow();
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it('no-ops when Web Audio is unavailable', () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: undefined,
    });

    expect(() => playTaskSoundCue('create')).not.toThrow();
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it('creates the audio context lazily on the first cue', () => {
    configureTaskSoundEffects({ enabled: true, volume: 35 });

    expect(MockAudioContext.instances).toHaveLength(0);

    playTaskSoundCue('update');

    expect(MockAudioContext.instances).toHaveLength(1);
    expect(MockAudioContext.instances[0]?.oscillators.length).toBeGreaterThan(
      0
    );
    expect(MockAudioContext.instances[0]?.gains.length).toBeGreaterThan(0);
  });

  it('respects disabled sound effects and zero volume', () => {
    configureTaskSoundEffects({ enabled: false, volume: 35 });
    playTaskSoundCue('complete');
    expect(MockAudioContext.instances).toHaveLength(0);

    configureTaskSoundEffects({ enabled: true, volume: 0 });
    playTaskSoundCue('complete');
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it('clamps volume and intensity while reusing one context', () => {
    configureTaskSoundEffects({ enabled: true, volume: 500 });

    playTaskSoundCue({ cue: 'complete', count: 999, intensity: 99 });
    playTaskSoundCue({ cue: 'move', count: 1, intensity: 1 });

    expect(MockAudioContext.instances).toHaveLength(1);
    const context = MockAudioContext.instances[0];
    const firstMasterGain = context?.gains[0];

    expect(firstMasterGain?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      1,
      expect.any(Number)
    );
    expect(context?.oscillators.length).toBeGreaterThanOrEqual(6);
  });

  it('uses one richer aggregate playback path for bulk complete cues', () => {
    configureTaskSoundEffects({ enabled: true, volume: 35 });

    playTaskSoundCue({ cue: 'complete', count: 8 });

    expect(MockAudioContext.instances).toHaveLength(1);
    const context = MockAudioContext.instances[0];

    expect(context?.oscillators).toHaveLength(5);
    expect(context?.gains).toHaveLength(6);
  });
});
