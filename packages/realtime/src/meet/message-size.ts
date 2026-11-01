export const MEET_MAX_MESSAGE_BYTES = 256 * 1024;

export function isMeetMessageWithinLimit(raw: string | ArrayBuffer) {
  return (
    (typeof raw === 'string'
      ? new TextEncoder().encode(raw).byteLength
      : raw.byteLength) <= MEET_MAX_MESSAGE_BYTES
  );
}
