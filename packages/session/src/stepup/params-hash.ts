/**
 * The parameters hash a `ttr+stepup` proof carries in `ph`. The minting side
 * and the relying service both call `paramsHash` over the same stored
 * challenge values; neither serializes them another way.
 */
import { STEP_UP_ACTS, type StepUpClaims } from '../tokens/profiles';
import { digestActParams, PARAMS_HASH_DOMAIN } from './params-digest';

export type StepUpAct = StepUpClaims['act'];

export { PARAMS_HASH_DOMAIN };
export const PARAMS_HASH_BYTES = 32;

export type ParamsHashResult =
  | Readonly<{
      ok: true;
      /** The 32 SHA-256 bytes. */
      hash: Uint8Array<ArrayBuffer>;
      /** The same bytes in canonical base64url, the `ph` claim value. */
      ph: string;
    }>
  | Readonly<{ ok: false; reason: 'act' | 'params' }>;

/** Whether `value` is a registered `ttr+stepup` act. */
export function isStepUpAct(value: unknown): value is StepUpAct {
  return typeof value === 'string' && STEP_UP_ACTS.includes(value);
}

/**
 * SHA-256 over the UTF-8 bytes of `ttr-stepup/v1|<act>|<canonicalJson(params)>`.
 * `act` must be a registered `ttr+stepup` act, and `params` must be accepted
 * by `canonicalJson`; otherwise nothing is hashed.
 */
export async function paramsHash(
  act: StepUpAct,
  params: unknown
): Promise<ParamsHashResult> {
  if (!isStepUpAct(act)) return { ok: false, reason: 'act' };
  const digest = await digestActParams(act, params);
  if (!digest) return { ok: false, reason: 'params' };
  return Object.freeze({ ok: true, hash: digest.hash, ph: digest.ph });
}
