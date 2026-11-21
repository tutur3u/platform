import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planSenderEncodings } from './bandwidth';
import {
  applyMediaPolicy,
  createMediaPolicy,
  initialAudioOnly,
  nextAudioOnly,
  resolveSmallMode,
  SMALL_MODE_STORAGE_KEY,
  visibilityPhaseAfter,
  watchPageVisibility,
} from './media-policy';
import { planWindowedRemoteSubscriptions } from './negotiation';

const window = {
  cameraUserIds: ['a', 'b'],
  spotlightUserId: 'a',
  changedAt: 0,
};
const snapshot = {
  smallModePreference: 'auto' as const,
  audioOnly: false,
  visibility: 'visible' as const,
};

describe('thumbnail mode', () => {
  it('turns on automatically for large rooms or weak networks unless overridden', () => {
    expect(resolveSmallMode('auto', 24, false)).toBe(false);
    expect(resolveSmallMode('auto', 25, false)).toBe(true);
    expect(resolveSmallMode('auto', 3, true)).toBe(true);
    expect(resolveSmallMode('off', 80, true)).toBe(false);
    expect(resolveSmallMode('on', 2, false)).toBe(true);
  });

  it('remembers the preference and survives denied storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    const policy = createMediaPolicy(storage);
    const listener = vi.fn();
    policy.subscribe(listener);
    policy.setSmallModePreference('on');
    expect(values.get(SMALL_MODE_STORAGE_KEY)).toBe('on');
    expect(createMediaPolicy(storage).getSnapshot().smallModePreference).toBe(
      'on'
    );
    policy.setSmallModePreference('on');
    expect(listener).toHaveBeenCalledTimes(1);
    const denied = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const fallback = createMediaPolicy(denied);
    fallback.setSmallModePreference('off');
    expect(fallback.getSnapshot().smallModePreference).toBe('off');
  });

  it('stops publishing the full layer while thumbnail-only', () => {
    const plan = planSenderEncodings(
      'video',
      'auto',
      { available: 5_000_000, rtt: 30, loss: 0 },
      { participants: 40, thumbnailOnly: true },
      true,
      [{ rid: 'f' }, { rid: 'h' }, { rid: 'q' }]
    );
    expect(plan.map((layer) => layer.active)).toEqual([false, true, true]);
  });
});

describe('applyMediaPolicy', () => {
  it('keeps the window as-is when visible', () => {
    expect(applyMediaPolicy(window, snapshot, 4)).toMatchObject({
      cameraUserIds: ['a', 'b'],
      spotlightUserId: 'a',
      screenVideo: true,
      smallMode: false,
    });
  });

  it('puts every camera on the lowest layer when dimmed', () => {
    expect(
      applyMediaPolicy(window, { ...snapshot, visibility: 'dimmed' }, 4)
    ).toMatchObject({ spotlightUserId: undefined, smallMode: true });
  });

  it('closes camera and screen video in the background and when audio-only', () => {
    expect(
      applyMediaPolicy(window, { ...snapshot, visibility: 'background' }, 4)
    ).toMatchObject({ cameraUserIds: [], screenVideo: false });
    expect(
      applyMediaPolicy(window, { ...snapshot, audioOnly: true }, 4)
    ).toMatchObject({ cameraUserIds: [], screenVideo: true });
  });

  it('keeps remote audio and drops screen video from a background window', () => {
    const track = (kind: string) => ({
      userId: 'a',
      sessionId: 'a',
      trackName: `a-${kind}`,
    });
    const remoteTracks = Object.fromEntries(
      ['audio', 'video', 'screen', 'screen_audio'].map((kind) => [
        `a:a-${kind}`,
        track(kind),
      ])
    );
    const plan = planWindowedRemoteSubscriptions({
      remoteTracks,
      subscribedKeys: ['a:a-video', 'a:a-screen'],
      selfUserId: 'me',
      videoWindow: applyMediaPolicy(
        window,
        { ...snapshot, visibility: 'background' },
        4
      ),
    });
    expect(plan.close.sort()).toEqual(['a:a-screen', 'a:a-video']);
    expect(plan.pending.map((entry) => entry.trackName).sort()).toEqual([
      'a-audio',
      'a-screen_audio',
    ]);
  });
});

describe('audio-only fallback', () => {
  const bad = { congested: true, ceiling: 'low' as const };
  it('pauses cameras after three congested samples at the lowest layer', () => {
    let state = initialAudioOnly();
    state = nextAudioOnly(state, { congested: true, ceiling: 'mid' }, 0);
    expect(state.severe).toBe(0);
    state = nextAudioOnly(state, bad, 2000);
    state = nextAudioOnly(state, bad, 4000);
    expect(state.active).toBe(false);
    state = nextAudioOnly(state, bad, 6000);
    expect(state).toMatchObject({ active: true, until: 36_000 });
  });

  it('probes after the pause and doubles it on a quick relapse', () => {
    let state = { ...initialAudioOnly(), active: true, until: 30_000 };
    expect(nextAudioOnly(state, null, 29_000).active).toBe(true);
    state = nextAudioOnly(state, null, 30_000);
    expect(state).toMatchObject({ active: false, probedAt: 30_000 });
    for (const now of [32_000, 34_000, 36_000])
      state = nextAudioOnly(state, bad, now);
    expect(state).toMatchObject({ active: true, probeMs: 60_000 });
  });

  it('resets the severe run on any healthy sample', () => {
    let state = nextAudioOnly(initialAudioOnly(), bad, 0);
    state = nextAudioOnly(state, { congested: false, ceiling: 'low' }, 2000);
    expect(state.severe).toBe(0);
  });
});

describe('page visibility', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('maps hidden time to a phase', () => {
    expect(visibilityPhaseAfter(null)).toBe('visible');
    expect(visibilityPhaseAfter(1000)).toBe('visible');
    expect(visibilityPhaseAfter(1500)).toBe('dimmed');
    expect(visibilityPhaseAfter(20_000)).toBe('background');
  });

  function fakeDocument() {
    const listeners = new Set<() => void>();
    return {
      visibilityState: 'visible' as DocumentVisibilityState,
      pictureInPictureElement: null as Element | null,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
      flip(state: DocumentVisibilityState) {
        this.visibilityState = state;
        for (const listener of listeners) listener();
      },
    };
  }

  it('debounces hiding, escalates to background and restores at once', () => {
    const doc = fakeDocument();
    const policy = createMediaPolicy(null);
    const stop = watchPageVisibility(
      policy,
      doc as never,
      () => !!doc.pictureInPictureElement
    );
    doc.flip('hidden');
    vi.advanceTimersByTime(1000);
    expect(policy.getSnapshot().visibility).toBe('visible');
    doc.flip('visible');
    vi.advanceTimersByTime(5000);
    expect(policy.getSnapshot().visibility).toBe('visible');
    doc.flip('hidden');
    vi.advanceTimersByTime(1500);
    expect(policy.getSnapshot().visibility).toBe('dimmed');
    vi.advanceTimersByTime(18_500);
    expect(policy.getSnapshot().visibility).toBe('background');
    doc.flip('visible');
    expect(policy.getSnapshot().visibility).toBe('visible');
    stop();
  });

  it('treats an open Picture-in-Picture view as visible', () => {
    const doc = fakeDocument();
    doc.pictureInPictureElement = {} as Element;
    const policy = createMediaPolicy(null);
    watchPageVisibility(policy, doc as never, () => true);
    doc.flip('hidden');
    vi.advanceTimersByTime(30_000);
    expect(policy.getSnapshot().visibility).toBe('visible');
  });
});
