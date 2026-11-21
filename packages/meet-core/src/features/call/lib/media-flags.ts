/**
 * Client media behaviour switches. Defaults are the shipped behaviour; a
 * browser-local override (`tumeet:media-flags`, JSON) lets QA and support turn
 * one off on a single device without a deploy.
 */
export type MeetMediaFlags = {
  /** Switch subscribed camera layers from tile size and receiver health. */
  layerSwitching: boolean;
  /** Ask the Opus encoder for discontinuous transmission during silence. */
  opusDtx: boolean;
  /** Drop the full camera layer and frame rate while the encoder is CPU-bound. */
  cpuAdaptation: boolean;
};

const DEFAULT_FLAGS: MeetMediaFlags = {
  layerSwitching: true,
  opusDtx: true,
  cpuAdaptation: true,
};
export const MEET_MEDIA_FLAGS_STORAGE_KEY = 'tumeet:media-flags';

export function readMeetMediaFlags(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined'
    ? null
    : localStorage
): MeetMediaFlags {
  try {
    const raw = storage?.getItem(MEET_MEDIA_FLAGS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_FLAGS;
    const flags = { ...DEFAULT_FLAGS };
    for (const key of Object.keys(DEFAULT_FLAGS) as Array<keyof MeetMediaFlags>)
      if (typeof (parsed as Record<string, unknown>)[key] === 'boolean')
        flags[key] = (parsed as Record<string, boolean>)[key]!;
    return flags;
  } catch {
    return DEFAULT_FLAGS;
  }
}
