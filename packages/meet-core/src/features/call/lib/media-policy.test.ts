import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planSenderEncodings } from './bandwidth';
import {
  applyMediaPolicy,
  createMediaPolicy,
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

  it('closes camera and screen video only for a hidden page, never for network quality', () => {
    expect(
      applyMediaPolicy(window, { ...snapshot, visibility: 'background' }, 4)
    ).toMatchObject({ cameraUserIds: [], screenVideo: false });
    expect(applyMediaPolicy(window, snapshot, 4, true)).toMatchObject({
      cameraUserIds: ['a', 'b'],
      screenVideo: true,
    });
    expect(Object.keys(createMediaPolicy(null).getSnapshot())).not.toContain(
      'audioOnly'
    );
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
