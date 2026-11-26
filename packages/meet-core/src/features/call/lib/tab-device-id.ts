/**
 * One device id per browser tab and meeting, kept across reloads.
 *
 * The id lives in `sessionStorage`, which a reload keeps and a new tab starts
 * empty, so a reload rejoins as the same device and the room resumes its
 * presence instead of counting a second one. A duplicated tab copies
 * `sessionStorage`, so each live page also holds a claim on its id in
 * `localStorage`: a page that finds its id claimed by another live page mints
 * a new one. A page drops its claim on `pagehide`, so its own reload finds the
 * id free; a claim nobody renews expires after `CLAIM_TTL_MS`.
 *
 * Every storage access is guarded: when storage is unavailable the page gets
 * a fresh random id, which joins as a new device.
 */

const DEVICE_PREFIX = 'meet:device:';
const CLAIM_PREFIX = 'meet:device-claim:';
/** How often a live page renews its claim. */
export const CLAIM_RENEW_MS = 15_000;
/** A claim older than this belongs to no live page; background tabs renew slowly. */
export const CLAIM_TTL_MS = 75_000;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface TabDeviceEnvironment {
  session?: KeyValueStorage | null;
  local?: KeyValueStorage | null;
  now?: () => number;
  randomId?: () => string;
}

export interface TabDeviceClaim {
  deviceId: string;
  /** Identifies this page load, so it only renews or drops its own claim. */
  nonce: string;
}

/** Storage key for one meeting and account; guests share the `guest` scope. */
export function tabDeviceKey(meetingId: string, accountId?: string | null) {
  return `${DEVICE_PREFIX}${meetingId}:${accountId || 'guest'}`;
}

function browserStorage(kind: 'sessionStorage' | 'localStorage') {
  try {
    return typeof window === 'undefined' ? null : window[kind];
  } catch {
    // Reading the property itself throws when the browser denies storage.
    return null;
  }
}

function environment(env: TabDeviceEnvironment = {}) {
  return {
    session:
      env.session === undefined ? browserStorage('sessionStorage') : env.session,
    local: env.local === undefined ? browserStorage('localStorage') : env.local,
    now: env.now ?? Date.now,
    randomId: env.randomId ?? (() => crypto.randomUUID()),
  };
}

function read(storage: KeyValueStorage | null, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: KeyValueStorage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
    return !!storage;
  } catch {
    return false;
  }
}

function claimOf(local: KeyValueStorage | null, deviceId: string) {
  const raw = read(local, CLAIM_PREFIX + deviceId);
  if (!raw) return null;
  try {
    const claim = JSON.parse(raw) as { nonce?: unknown; at?: unknown };
    return typeof claim.nonce === 'string' && typeof claim.at === 'number'
      ? { nonce: claim.nonce, at: claim.at }
      : null;
  } catch {
    return null;
  }
}

function writeClaim(
  local: KeyValueStorage | null,
  claim: TabDeviceClaim,
  at: number
) {
  write(
    local,
    CLAIM_PREFIX + claim.deviceId,
    JSON.stringify({ nonce: claim.nonce, at })
  );
}

/**
 * The device id for this page: the tab's stored id when no other live page
 * claims it, otherwise a new one, which becomes the tab's stored id.
 */
export function acquireTabDeviceId(
  key: string,
  env?: TabDeviceEnvironment
): TabDeviceClaim {
  const { session, local, now, randomId } = environment(env);
  const nonce = randomId();
  const stored = read(session, key);
  const owner = stored ? claimOf(local, stored) : null;
  const taken = !!owner && now() - owner.at < CLAIM_TTL_MS;
  const deviceId = stored && !taken ? stored : randomId();
  if (deviceId !== stored) write(session, key, deviceId);
  const claim = { deviceId, nonce };
  writeClaim(local, claim, now());
  return claim;
}

/** Keeps this page's claim fresh; it never takes over another page's claim. */
export function renewTabDeviceClaim(
  claim: TabDeviceClaim,
  env?: TabDeviceEnvironment
) {
  const { local, now } = environment(env);
  const owner = claimOf(local, claim.deviceId);
  if (owner && owner.nonce !== claim.nonce) return;
  writeClaim(local, claim, now());
}

/** Drops this page's claim, so a reload of this tab reuses the id. */
export function releaseTabDeviceClaim(
  claim: TabDeviceClaim,
  env?: TabDeviceEnvironment
) {
  const { local } = environment(env);
  if (claimOf(local, claim.deviceId)?.nonce !== claim.nonce) return;
  try {
    local?.removeItem(CLAIM_PREFIX + claim.deviceId);
  } catch {
    // The claim expires on its own.
  }
}
