import { z } from 'zod';

/** The auto-hide choices hosts get for the stage's join QR, in minutes. */
export const MEET_JOIN_QR_AUTO_HIDE_MINUTES = [2, 5, 10] as const;
export type MeetJoinQrAutoHide =
  (typeof MEET_JOIN_QR_AUTO_HIDE_MINUTES)[number];

/**
 * Room settings features a room announces with its settings. A room on an
 * older realtime Worker announces none and drops the join QR keys, so
 * clients keep the QR's room controls off until the room lists `joinQr`.
 */
export const MEET_ROOM_SETTINGS_FEATURES = ['joinQr'] as const;
export type MeetRoomSettingsFeature =
  (typeof MEET_ROOM_SETTINGS_FEATURES)[number];

/** Settings a room manager patches; both need the participant manage scope. */
export const MEET_JOIN_QR_SETTING_KEYS = [
  'joinQrHidden',
  'joinQrAutoHide',
] as const;

export const meetJoinQrPatchSettings = {
  /** Hides the stage's join QR for everyone. Unset means shown. */
  joinQrHidden: z.boolean().optional(),
  /** Minutes after it was last shown that the QR hides itself; null is off. */
  joinQrAutoHide: z
    .union([z.literal(2), z.literal(5), z.literal(10)])
    .nullable()
    .optional(),
};

export const meetJoinQrSettings = {
  ...meetJoinQrPatchSettings,
  /** Room time of the last show or auto-hide change; only the room sets it. */
  joinQrShownAt: z.iso.datetime({ offset: true }).optional(),
};

type JoinQrSettings = {
  joinQrHidden?: boolean;
  joinQrAutoHide?: MeetJoinQrAutoHide | null;
  joinQrShownAt?: string;
};

/** True when a patch shows the QR or changes its auto-hide. */
export function restartsMeetJoinQr(patch: {
  joinQrHidden?: boolean;
  joinQrAutoHide?: unknown;
}) {
  return 'joinQrAutoHide' in patch || patch.joinQrHidden === false;
}

/**
 * Restarts the auto-hide clock on the room's own time whenever a manager
 * shows the QR or changes its auto-hide, so every client hides it together.
 * Hiding keeps the last stamp.
 */
export function stampMeetJoinQr<T extends JoinQrSettings>(
  settings: T,
  patch: { joinQrHidden?: boolean; joinQrAutoHide?: unknown },
  now: string
): T {
  return restartsMeetJoinQr(patch)
    ? { ...settings, joinQrShownAt: now }
    : settings;
}

/** When the QR hides itself, in epoch ms, or null when it does not. */
export function meetJoinQrHidesAt(settings: JoinQrSettings | undefined) {
  const minutes = settings?.joinQrAutoHide;
  if (settings?.joinQrHidden || !minutes) return null;
  const since = Date.parse(settings.joinQrShownAt ?? '');
  return Number.isFinite(since) ? since + minutes * 60_000 : null;
}

/** Whether the stage shows the join QR at `now` (epoch ms). */
export function isMeetJoinQrShown(
  settings: JoinQrSettings | undefined,
  now: number
) {
  if (settings?.joinQrHidden) return false;
  const hidesAt = meetJoinQrHidesAt(settings);
  return hidesAt === null || now < hidesAt;
}
