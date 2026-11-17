// Fixed stop codes for the Calendar exact-SHA stage path. Every failure leaves
// the run with one enumerated guardCode and the phase it stopped in, so the
// job summary and the release desk can match a stop without parsing prose.
export const GUARD_CODES = Object.freeze([
  'USAGE_MODE',
  'SOURCE_SHA_INVALID',
  'ALIAS_PREIMAGE_INPUT_INVALID',
  'CREDENTIALS_MISSING',
  'SOURCE_NOT_ON_MAIN',
  'SOURCE_HEAD_MISMATCH',
  'GIT_COMMAND_FAILED',
  'BUILD_RECIPE_NOT_LEGACY',
  'ALIAS_PREIMAGE_UNBOUND',
  'ALIAS_PREIMAGE_MISMATCH',
  'DEPLOYMENT_NOT_READY',
  'PROJECT_MISMATCH',
  'URL_NOT_HTTPS',
  'DEPLOYMENT_INSPECT_FAILED',
  'OUTPUT_ROOT_INVALID',
  'OUTPUT_ENV_FILE',
  'OUTPUT_NESTED_VERCEL',
  'OUTPUT_KEY_FILE',
  'OUTPUT_SYMLINK',
  'OUTPUT_OUTSIDE_ROOT',
  'OUTPUT_SPECIAL_FILE',
  'OUTPUT_MISSING',
  'OUTPUT_NATIVE_ARTIFACT',
  'OUTPUT_NO_NEXT_ASSETS',
  'OUTPUT_SEAL_INVALID',
  'STAGED_URL_INVALID',
  'STAGED_ID_MISSING',
  'STAGED_OWNS_ALIAS',
  'STAGED_COMMIT_MISMATCH',
  'STAGED_SEAL_MISMATCH',
  'SUPABASE_HOST_REJECTED',
  'ALIAS_MOVED',
  'TOKEN_IN_ARGV',
  'TOKEN_IN_OUTPUT',
  'VERCEL_SUBCOMMAND_REFUSED',
  'VERCEL_COMMAND_FAILED',
  'UNEXPECTED_FAILURE',
]);

export class StageStop extends Error {
  constructor(guardCode, message, phase = '') {
    if (!GUARD_CODES.includes(guardCode)) {
      throw new TypeError(`unknown guardCode ${guardCode}`);
    }
    super(message);
    this.name = 'StageStop';
    this.guardCode = guardCode;
    this.phase = phase;
  }
}

export function stop(guardCode, message) {
  return new StageStop(guardCode, message);
}

// Attach the phase to a guard stop, or wrap any other failure as an
// UNEXPECTED_FAILURE in that phase. The message is redacted first.
export function asStop(error, phase, redact = String) {
  if (error instanceof StageStop) {
    if (!error.phase) error.phase = phase;
    error.message = redact(error.message);
    return error;
  }
  return new StageStop(
    'UNEXPECTED_FAILURE',
    redact(error?.message || 'stage failed'),
    phase
  );
}

export async function inPhase(phase, fn, redact) {
  try {
    return await fn();
  } catch (error) {
    throw asStop(error, phase, redact);
  }
}

export function formatStop(error) {
  return `[${error.guardCode}] phase=${error.phase || 'unknown'}: ${error.message}`;
}

export function stopRecord(error) {
  return [
    'terminal_state=stopped',
    `guard_code=${error.guardCode}`,
    `phase=${error.phase || 'unknown'}`,
  ];
}
