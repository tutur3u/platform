import 'server-only';

export type EraseSubject = {
  wsId: string;
  meetingId: string;
  subjectId: string;
};

export type EraseSubjectKey = {
  version: number;
  bytes: Uint8Array;
};

const DOMAIN = new TextEncoder().encode('meet-erase-subject/v1');
const UUID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

function uuidBytes(value: string, allowNil: boolean): Uint8Array {
  if (
    !UUID.test(value) &&
    !(allowNil && value === '00000000-0000-0000-0000-000000000000')
  ) {
    throw new Error('MEET_ERASE_INVALID_UUID');
  }
  const hex = value.replaceAll('-', '');
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  );
}

export function encodeEraseSubject(subject: EraseSubject): Uint8Array {
  const message = new Uint8Array(DOMAIN.length + 2 + 48);
  message.set(DOMAIN);
  message[DOMAIN.length] = 0;
  message[DOMAIN.length + 1] = 1;
  for (const [index, id] of [
    subject.wsId,
    subject.meetingId,
    subject.subjectId,
  ].entries()) {
    message.set(uuidBytes(id, index === 0), DOMAIN.length + 2 + index * 16);
  }
  return message;
}

/** Any future tag verification must use a constant-time comparison. */
export async function createEraseSubjectTag({
  key,
  ...subject
}: EraseSubject & {
  key: EraseSubjectKey | null | undefined;
}): Promise<{ subjectTag: string; subjectKeyVersion: number }> {
  if (
    !key ||
    key.bytes.byteLength < 32 ||
    !Number.isSafeInteger(key.version) ||
    key.version < 1
  ) {
    throw new Error('MEET_ERASE_LOG_KEY_UNAVAILABLE');
  }
  const message = encodeEraseSubject(subject);
  const version = key.version;
  try {
    const signingKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(key.bytes),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      signingKey,
      new Uint8Array(message)
    );
    return {
      subjectTag: Array.from(new Uint8Array(signature), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join(''),
      subjectKeyVersion: version,
    };
  } catch {
    throw new Error('MEET_ERASE_LOG_KEY_UNAVAILABLE');
  }
}
