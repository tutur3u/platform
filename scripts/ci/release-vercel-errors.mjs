export const RELEASE_CODES = Object.freeze([
  'RELEASE_CONFIG_INVALID',
  'RELEASE_RECEIPT_MISMATCH',
  'RELEASE_APPROVAL_REQUIRED',
  'RELEASE_ALIAS_MISMATCH',
  'RELEASE_PROBE_INVALID',
  'RELEASE_WATCH_EXPIRED',
]);
export class ReleaseStop extends Error {
  constructor(code, phase) {
    super(code);
    if (!RELEASE_CODES.includes(code))
      throw new TypeError('Unknown release guard');
    this.guardCode = code;
    this.guardPhase = phase;
  }
}
