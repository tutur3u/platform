import 'server-only';
import { getTranslations } from 'next-intl/server';
import { MeetAiError } from './access';

/** The per-speaker notice keys, in the order the notice shows them. */
export const SELF_NOTICE_KEYS = [
  'self_body',
  'self_notice',
  'self_readers',
] as const;

const NOTICE_LOCALES = new Set(['en', 'vi']);

/** SHA-256 hex of UTF-8 text; the same digest the client hashes. */
export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** The hash of the exact per-speaker notice text shown in one locale. */
export async function expectedSelfNoticeHash(locale: string) {
  const t = await getTranslations({ locale, namespace: 'meet.ai' });
  return sha256Hex(SELF_NOTICE_KEYS.map((key) => t(key)).join('\n'));
}

/**
 * An Allow must carry the hash of the notice text this server ships for the
 * stated locale, so the recorded evidence names text the person was shown.
 */
export async function requireShownSelfNotice(input: {
  locale: string;
  textHash: string;
}) {
  const matches =
    NOTICE_LOCALES.has(input.locale) &&
    (await expectedSelfNoticeHash(input.locale)) === input.textHash;
  if (!matches)
    throw new MeetAiError(
      409,
      'The transcription notice changed; review it and try again',
      'MEET_SELF_NOTICE_MISMATCH'
    );
}
