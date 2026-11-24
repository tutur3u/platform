import 'server-only';

/** The redesigned join flow stays off until the Worker var is set to `true`. */
export function isMeetUxV2Enabled() {
  return process.env.MEET_UX_V2 === 'true';
}
