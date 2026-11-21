import type { MeetVideoLayer } from '@tuturuuu/realtime/meet';
import type { StageVideoWindow } from './room-actions';

/** Thumbnail mode: every non-spotlit camera is sent and received small. */
export type SmallModePreference = 'auto' | 'on' | 'off';
/** Rooms at or above this many participants use thumbnail mode automatically. */
export const SMALL_MODE_PARTICIPANTS = 25;
export const SMALL_MODE_STORAGE_KEY = 'tumeet:small-mode';

/**
 * Page visibility as the subscriber sees it. `dimmed`: hidden briefly, every
 * camera on its lowest layer so a quick tab switch returns instantly.
 * `background`: hidden for a while, all remote video closed, audio kept.
 */
export type VisibilityPhase = 'visible' | 'dimmed' | 'background';
export const DIM_AFTER_HIDDEN_MS = 1500;
export const BACKGROUND_AFTER_HIDDEN_MS = 20_000;

export type MediaPolicySnapshot = {
  smallModePreference: SmallModePreference;
  /** Cameras are paused on this receiver to keep speech intelligible. */
  audioOnly: boolean;
  visibility: VisibilityPhase;
};

export function resolveSmallMode(
  preference: SmallModePreference,
  participants: number,
  weakNetwork: boolean
) {
  if (preference !== 'auto') return preference === 'on';
  return participants >= SMALL_MODE_PARTICIPANTS || weakNetwork;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const browserStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/**
 * Per-call media policy shared by the publisher, the subscriber and the UI
 * without React state, so policy changes never re-render the room. The
 * thumbnail preference is remembered on this device.
 */
export function createMediaPolicy(storage: Storage | null = browserStorage()) {
  const read = (): SmallModePreference => {
    try {
      const saved = storage?.getItem(SMALL_MODE_STORAGE_KEY);
      return saved === 'on' || saved === 'off' ? saved : 'auto';
    } catch {
      return 'auto';
    }
  };
  let snapshot: MediaPolicySnapshot = {
    smallModePreference: read(),
    audioOnly: false,
    visibility: 'visible',
  };
  const listeners = new Set<() => void>();
  const set = (next: Partial<MediaPolicySnapshot>) => {
    const merged = { ...snapshot, ...next };
    if (
      merged.audioOnly === snapshot.audioOnly &&
      merged.smallModePreference === snapshot.smallModePreference &&
      merged.visibility === snapshot.visibility
    )
      return;
    snapshot = merged;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSmallModePreference: (smallModePreference: SmallModePreference) => {
      try {
        storage?.setItem(SMALL_MODE_STORAGE_KEY, smallModePreference);
      } catch {
        // An unsaved preference still applies to this call.
      }
      set({ smallModePreference });
    },
    setAudioOnly: (audioOnly: boolean) => set({ audioOnly }),
    setVisibility: (visibility: VisibilityPhase) => set({ visibility }),
  };
}
export type MediaPolicy = ReturnType<typeof createMediaPolicy>;

/** The video window the subscriber should pull under the current policy. */
export function applyMediaPolicy(
  window: StageVideoWindow | null,
  policy: MediaPolicySnapshot | undefined,
  participants: number,
  weakNetwork = false
): StageVideoWindow | null {
  if (!window || !policy) return window;
  const background = policy.visibility === 'background';
  const dimmed = policy.visibility === 'dimmed';
  return {
    ...window,
    cameraUserIds: policy.audioOnly || background ? [] : window.cameraUserIds,
    spotlightUserId: dimmed ? undefined : window.spotlightUserId,
    screenVideo: !background,
    smallMode:
      dimmed ||
      resolveSmallMode(policy.smallModePreference, participants, weakNetwork),
  };
}

/** The phase a page reaches after being hidden for `hiddenMs`. */
export function visibilityPhaseAfter(hiddenMs: number | null): VisibilityPhase {
  if (hiddenMs === null || hiddenMs < DIM_AFTER_HIDDEN_MS) return 'visible';
  return hiddenMs < BACKGROUND_AFTER_HIDDEN_MS ? 'dimmed' : 'background';
}

type VisibilityDocument = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
> & { pictureInPictureElement?: Element | null };

/**
 * Track page visibility into the policy. Becoming visible applies at once;
 * hiding is debounced so quick tab switches never thrash subscriptions. An
 * open Picture-in-Picture view counts as visible.
 */
export function watchPageVisibility(
  policy: Pick<MediaPolicy, 'setVisibility'>,
  doc: VisibilityDocument | undefined = typeof document === 'undefined'
    ? undefined
    : document,
  pipOpen: () => boolean = () =>
    !!doc?.pictureInPictureElement ||
    !!(globalThis as { documentPictureInPicture?: { window?: unknown } })
      .documentPictureInPicture?.window
) {
  if (!doc) return () => undefined;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => timers.splice(0).forEach(clearTimeout);
  const update = () => {
    clear();
    if (doc.visibilityState !== 'hidden' || pipOpen()) {
      policy.setVisibility('visible');
      return;
    }
    const schedule = (ms: number) =>
      timers.push(
        setTimeout(() => {
          if (doc.visibilityState === 'hidden' && !pipOpen())
            policy.setVisibility(visibilityPhaseAfter(ms));
        }, ms)
      );
    schedule(DIM_AFTER_HIDDEN_MS);
    schedule(BACKGROUND_AFTER_HIDDEN_MS);
  };
  update();
  doc.addEventListener('visibilitychange', update);
  return () => {
    clear();
    doc.removeEventListener('visibilitychange', update);
  };
}

export type AudioOnlyState = {
  active: boolean;
  /** Consecutive congested samples already at the lowest layer. */
  severe: number;
  until: number;
  probeMs: number;
  probedAt: number;
};

const AUDIO_ONLY_SEVERE_SAMPLES = 3;
const AUDIO_ONLY_BASE_PROBE_MS = 30_000;
const AUDIO_ONLY_MAX_PROBE_MS = 240_000;

export function initialAudioOnly(): AudioOnlyState {
  return {
    active: false,
    severe: 0,
    until: 0,
    probeMs: AUDIO_ONLY_BASE_PROBE_MS,
    probedAt: -Infinity,
  };
}

/**
 * Last-resort receiver fallback: when cameras stay congested even at the
 * lowest layer, pause them so speech and screen share keep the link. With no
 * camera to measure, recovery is a timed probe at the lowest layer; a probe
 * that relapses within 30 seconds doubles the next pause, up to four minutes.
 */
export function nextAudioOnly(
  state: AudioOnlyState,
  signal: { congested: boolean; ceiling: MeetVideoLayer } | null,
  now: number
): AudioOnlyState {
  if (state.active)
    return now < state.until
      ? state
      : { ...state, active: false, severe: 0, probedAt: now };
  if (!signal?.congested || signal.ceiling !== 'low')
    return { ...state, severe: 0 };
  const severe = state.severe + 1;
  if (severe < AUDIO_ONLY_SEVERE_SAMPLES) return { ...state, severe };
  const relapse = now - state.probedAt < AUDIO_ONLY_BASE_PROBE_MS;
  const probeMs = relapse
    ? Math.min(AUDIO_ONLY_MAX_PROBE_MS, state.probeMs * 2)
    : AUDIO_ONLY_BASE_PROBE_MS;
  return { ...state, active: true, severe: 0, until: now + probeMs, probeMs };
}
