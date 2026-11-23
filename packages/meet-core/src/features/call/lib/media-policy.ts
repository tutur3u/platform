import { createMediaQualityRecorder } from './media-quality';
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
    visibility: 'visible',
  };
  const listeners = new Set<() => void>();
  const set = (next: Partial<MediaPolicySnapshot>) => {
    const merged = { ...snapshot, ...next };
    if (
      merged.smallModePreference === snapshot.smallModePreference &&
      merged.visibility === snapshot.visibility
    )
      return;
    snapshot = merged;
    for (const listener of listeners) listener();
  };
  return {
    quality: createMediaQualityRecorder(),
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
    cameraUserIds: background ? [] : window.cameraUserIds,
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
> & {
  pictureInPictureElement?: Element | null;
  querySelectorAll?: (selector: 'video') => ArrayLike<HTMLVideoElement>;
};

/** WebKit exposes Picture-in-Picture as a per-video presentation mode. */
const webkitPipOpen = (doc: VisibilityDocument) =>
  Array.from(doc.querySelectorAll?.('video') ?? []).some(
    (video) =>
      (video as HTMLVideoElement & { webkitPresentationMode?: string })
        .webkitPresentationMode === 'picture-in-picture'
  );

/** Events that open or close a Picture-in-Picture view while hidden. */
const PIP_EVENTS = [
  'enterpictureinpicture',
  'leavepictureinpicture',
  'webkitpresentationmodechanged',
] as const;

type DocumentPip = EventTarget & { window?: unknown };
const documentPip = () =>
  (globalThis as { documentPictureInPicture?: DocumentPip })
    .documentPictureInPicture;

/**
 * Track page visibility into the policy. Becoming visible applies at once;
 * hiding is debounced so quick tab switches never thrash subscriptions. An
 * open Picture-in-Picture view counts as visible, and opening or closing one
 * while hidden is reconciled immediately. Phases derive from wall time, so a
 * page the browser suspended lands in the right phase when it resumes.
 */
export function watchPageVisibility(
  policy: Pick<MediaPolicy, 'setVisibility'>,
  doc: VisibilityDocument | undefined = typeof document === 'undefined'
    ? undefined
    : document,
  pipOpen: () => boolean = () =>
    !!doc?.pictureInPictureElement ||
    !!documentPip()?.window ||
    (!!doc && webkitPipOpen(doc)),
  clock: () => number = Date.now
) {
  if (!doc) return () => undefined;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let hiddenAt: number | null = null;
  const clear = () => timers.splice(0).forEach(clearTimeout);
  const update = () => {
    clear();
    if (doc.visibilityState !== 'hidden' || pipOpen()) {
      hiddenAt = null;
      policy.setVisibility('visible');
      return;
    }
    const now = clock();
    hiddenAt ??= now;
    const hiddenMs = now - hiddenAt;
    policy.setVisibility(visibilityPhaseAfter(hiddenMs));
    for (const at of [DIM_AFTER_HIDDEN_MS, BACKGROUND_AFTER_HIDDEN_MS])
      if (at > hiddenMs) timers.push(setTimeout(update, at - hiddenMs));
  };
  update();
  doc.addEventListener('visibilitychange', update);
  for (const name of PIP_EVENTS) doc.addEventListener(name, update, true);
  const pip = documentPip();
  pip?.addEventListener('enter', update);
  // A document Picture-in-Picture window reports its own close; recheck
  // after it is gone.
  let pipWindow: EventTarget | undefined;
  const onPipHide = () => timers.push(setTimeout(update, 0));
  const onPipEnter = (event: Event) => {
    pipWindow?.removeEventListener('pagehide', onPipHide);
    pipWindow = (event as Event & { window?: EventTarget }).window;
    pipWindow?.addEventListener('pagehide', onPipHide, { once: true });
  };
  pip?.addEventListener('enter', onPipEnter);
  // A window opened before this watcher started reports its close too.
  if (pip?.window)
    onPipEnter(Object.assign(new Event('enter'), { window: pip.window }));
  return () => {
    clear();
    pipWindow?.removeEventListener('pagehide', onPipHide);
    doc.removeEventListener('visibilitychange', update);
    for (const name of PIP_EVENTS) doc.removeEventListener(name, update, true);
    pip?.removeEventListener('enter', update);
    pip?.removeEventListener('enter', onPipEnter);
  };
}
