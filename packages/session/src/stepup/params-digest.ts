/**
 * The one SHA-256 parameters digest. `paramsHash` applies it to `ttr+stepup`
 * acts, and the device state machine to its step-up grant acts, so both hash
 * `ttr-stepup/v1|<act>|<canonicalJson(params)>` and nothing is canonicalized
 * a second way. It checks no act list; each caller checks its own first.
 */
import { canonicalJson, encodeBase64Url, utf8 } from '../encoding';

export const PARAMS_HASH_DOMAIN = 'ttr-stepup/v1';

export type ParamsDigest = Readonly<{
  /** The 32 SHA-256 bytes. */
  hash: Uint8Array<ArrayBuffer>;
  /** The same bytes in canonical base64url. */
  ph: string;
}>;

/** Null when `canonicalJson` rejects `params`. */
export async function digestActParams(
  act: string,
  params: unknown
): Promise<ParamsDigest | null> {
  const canonical = canonicalJson(params);
  if (canonical === undefined) return null;
  const hash = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      utf8(`${PARAMS_HASH_DOMAIN}|${act}|${canonical}`)
    )
  );
  return Object.freeze({ hash, ph: encodeBase64Url(hash) });
}
