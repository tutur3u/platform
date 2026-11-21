/**
 * `@tuturuuu/session/stepup`: the `ttr+stepup` proof's canonical parameters
 * hash, verifier and authorization ports. It verifies only; minting stays in
 * `@tuturuuu/session/tokens`.
 */
export { canonicalJson } from './encoding';
export type { KeySource, TokenKey } from './token-core';
export { STEP_UP_ACTS } from './tokens/profiles';
export {
  type AuthorizeStepUpOptions,
  authorizeStepUp,
  type SessionLivenessInput,
  type SessionLivenessPort,
  type SessionLivenessResult,
  type StepUpAuthorization,
  type StepUpAuthorizeFailureReason,
  type StepUpAuthorizeResult,
  type StepUpConsumeInput,
  type StepUpConsumePort,
  type StepUpConsumeResult,
} from './stepup/authorize';
export {
  isStepUpAct,
  PARAMS_HASH_BYTES,
  PARAMS_HASH_DOMAIN,
  type ParamsHashResult,
  paramsHash,
  type StepUpAct,
} from './stepup/params-hash';
export {
  type StepUpFactor,
  type StepUpFailure,
  type StepUpFailureReason,
  type StepUpVerified,
  type StepUpVerifyOptions,
  verifyStepUpProof,
} from './stepup/verify-proof';
