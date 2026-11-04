export type PolicyNoticeErrorCode =
  | 'invalid_request'
  | 'confirm_required'
  | 'dry_run_required'
  | 'test_send_required'
  | 'version_locked';

const GATE_CODES: readonly PolicyNoticeErrorCode[] = [
  'dry_run_required',
  'test_send_required',
  'version_locked',
];

export class PolicyNoticeError extends Error {
  constructor(readonly code: PolicyNoticeErrorCode) {
    super(`Policy notice refused: ${code}`);
    this.name = 'PolicyNoticeError';
  }
}

/** Maps a `policy_notice_gate:<code>` database refusal to a typed error. */
export function gateError(error: unknown): PolicyNoticeError | null {
  const message = error instanceof Error ? error.message : String(error);
  const code = /policy_notice_gate:([a-z_]+)/.exec(message)?.[1];
  return GATE_CODES.find((gate) => gate === code)
    ? new PolicyNoticeError(code as PolicyNoticeErrorCode)
    : null;
}
