import { z } from 'zod';

export const MIRA_ACCOUNT_CONFIRMATION_KEY = 'meet_mira_account_confirmation';
export const MIRA_ACCOUNT_CONFIRMATION_VERSION = '2026-11-25-v1';
export const miraConfirmationLocale = z.enum(['en', 'vi']);
export type MiraConfirmationLocale = z.infer<typeof miraConfirmationLocale>;

export const miraConfirmationMarker = z.object({
  version: z.literal(MIRA_ACCOUNT_CONFIRMATION_VERSION),
  confirmedAt: z.iso.datetime(),
  locale: miraConfirmationLocale,
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
});

/** When the account confirmed Mira: 0 for an undated marker, else null. */
export function miraConfirmedAt(marker: unknown): number | null {
  if (marker === MIRA_ACCOUNT_CONFIRMATION_VERSION) return 0;
  const parsed = miraConfirmationMarker.safeParse(marker);
  return parsed.success ? Date.parse(parsed.data.confirmedAt) : null;
}

export function isMiraAccountConfirmed(marker: unknown) {
  return (
    marker === MIRA_ACCOUNT_CONFIRMATION_VERSION ||
    miraConfirmationMarker.safeParse(marker).success
  );
}
