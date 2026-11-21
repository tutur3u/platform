/**
 * Camera simulcast RIDs, highest quality first.
 *
 * Cloudflare Realtime falls back between layers in ASCII order
 * (`priorityOrdering` / `ridNotAvailable: 'asciibetical'`), so the names must
 * sort from highest to lowest quality: full, half, quarter. The legacy
 * `h`/`m`/`l` names sort as h < l < m, which would drop a constrained
 * high-layer subscriber straight to the lowest layer.
 */
export const MEET_CAMERA_RIDS = ['f', 'h', 'q'] as const;
/** Names published by clients built before the ASCII-ordered scheme. */
export const LEGACY_MEET_CAMERA_RIDS = ['h', 'm', 'l'] as const;
/**
 * Media protocol features this room server understands. Clients publish the
 * ASCII-ordered RIDs and send layer updates only when the server advertises
 * them, so a rollback to an older room server keeps every subscription valid.
 */
export const MEET_MEDIA_CAPABILITIES = [
  'ascii-simulcast',
  'layer-update',
] as const;
export type MeetMediaCapability = (typeof MEET_MEDIA_CAPABILITIES)[number];
export const MEET_CAMERA_RID_VALUES = ['f', 'h', 'q', 'm', 'l'] as const;

export type MeetCameraRid = (typeof MEET_CAMERA_RID_VALUES)[number];
/** Semantic layer, independent of the RID naming scheme a publisher used. */
export type MeetVideoLayer = 'high' | 'mid' | 'low';
export const MEET_VIDEO_LAYERS: readonly MeetVideoLayer[] = [
  'high',
  'mid',
  'low',
];

/** RIDs a publisher advertised in its SDP section, highest quality first. */
export function advertisedCameraRids(section: string): MeetCameraRid[] {
  const sends = (rid: string) =>
    new RegExp(`^a=rid:${rid} send`, 'm').test(section);
  const current = MEET_CAMERA_RIDS.filter(sends);
  // `h` exists in both schemes; `f` or `q` identifies the current one.
  if (current.some((rid) => rid !== 'h')) return [...current];
  return LEGACY_MEET_CAMERA_RIDS.filter(sends);
}

function scheme(rids: readonly MeetCameraRid[]) {
  return rids.some((rid) => rid === 'f' || rid === 'q')
    ? MEET_CAMERA_RIDS
    : LEGACY_MEET_CAMERA_RIDS;
}

/** The publisher's RID for a semantic layer, or null when it is not sent. */
export function ridForLayer(
  rids: readonly MeetCameraRid[] | undefined,
  layer: MeetVideoLayer
): MeetCameraRid | null {
  if (!rids || rids.length < 2) return null;
  const rid = scheme(rids)[MEET_VIDEO_LAYERS.indexOf(layer)]!;
  return rids.includes(rid) ? rid : null;
}

export function layerForRid(
  rids: readonly MeetCameraRid[] | undefined,
  rid: string | undefined
): MeetVideoLayer | null {
  if (!rids || !rid) return null;
  const index = (scheme(rids) as readonly string[]).indexOf(rid);
  return index < 0 ? null : MEET_VIDEO_LAYERS[index]!;
}

/**
 * Subscription preference for a semantic layer.
 *
 * With ASCII-ordered RIDs the SFU may step down under receiver congestion and
 * when a paused layer is unavailable. Legacy RIDs keep their original request
 * shape so mixed-version rooms stay accepted by every deployed room server.
 */
export function simulcastPreference(
  rids: readonly MeetCameraRid[] | undefined,
  layer: MeetVideoLayer
) {
  const preferredRid = ridForLayer(rids, layer);
  if (!preferredRid) return null;
  return {
    preferredRid,
    priorityOrdering: 'asciibetical',
    ridNotAvailable: 'asciibetical',
  } as const;
}

/**
 * The publisher RIDs a subscriber may request from this room server. A server
 * that does not advertise ASCII-ordered simulcast only accepts legacy RIDs.
 */
export function negotiableCameraRids(
  rids: readonly MeetCameraRid[] | undefined,
  capabilities: readonly string[] | undefined
): readonly MeetCameraRid[] | undefined {
  if (!rids || capabilities?.includes('ascii-simulcast')) return rids;
  return scheme(rids) === LEGACY_MEET_CAMERA_RIDS ? rids : undefined;
}

/** Camera RIDs a publisher should advertise to this room server. */
export function publishedCameraRids(
  capabilities: readonly string[] | undefined
) {
  return capabilities?.includes('ascii-simulcast')
    ? MEET_CAMERA_RIDS
    : LEGACY_MEET_CAMERA_RIDS;
}
