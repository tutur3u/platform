// Hold units of the 2026-11-11 revision. Text in a hold unit stays out of
// every rendered page until the unit is released here; where the FINAL gives
// a publishable fallback, the fallback renders until then.
//
// Release only after the unit's condition is confirmed for publication day
// (legal and security own that call). Releasing never edits wording: the
// held text was extracted verbatim from the FINAL.

export const HOLD_UNITS = {
  // --- Per-workspace AI kill switch (D3 = Variant C) -----------------------
  ks: {
    condition:
      'WS-AI-KILL-SWITCH is live in production and every designated education and student workspace is switched off; security confirms each named feature is refused by SHA',
    where:
      'Privacy P3 bullet and P10 paragraph; Terms T9 bullet; DPA D9 bullet and D12 sentence; change-notice row "AI in student and education workspaces"',
  },
  // --- Paired HOLD blocks with publishable fallbacks ------------------------
  'r33-r34': {
    condition:
      'AI Studio retention cleanup jobs are scheduled and have run (first-run receipt)',
    where:
      'Privacy P7 "two rules" block and the 365/30-day table rows; change-notice retention row. Fallback: "kept until deleted" / "Until deleted"',
  },
  r32: {
    condition:
      'a purge job for soft-deleted accounts runs; the held row still carries the unfilled [N days] value, so it needs a text change and cannot be released here',
    where:
      'Privacy P7 "Your account details" row. Fallback: "fully deleted from live systems on request"',
    releasable: false,
  },
  'd4-google': {
    condition: "Google's processor DPA acceptance is verified",
    where:
      'DPA D4 written-contract paragraph. Fallback: "Tuturuuu relies on each subprocessor\'s published data-processing terms."',
  },
  // --- Mobile release date D ------------------------------------------------
  mobile: {
    condition:
      'released automatically when the notice config pins mobilePrivacyEffectiveDate on or before the notice date; stays held while it is unset (never use a placeholder date); otherwise add it here on D',
    where: 'Privacy P12 (whole section); the two Firebase registry rows',
  },
  // --- Sentence-level gates (tag rule: publish only if true, else delete) ---
  'privacy/privacy-section-5#1': {
    condition: 'the advertising-ID check is closed',
    where: 'Privacy P10 "We do not sell personal information" sentence',
  },
  'dpa/dpa-requests#1': {
    condition: 'the manual email-deletion runbook is tested',
    where: 'DPA D6 parenthetical "(Tuturuuu deletes them on request …)"',
  },
  'dpa/dpa-annex-2#1': {
    condition: 'the OpenAI support-chat entity is verified',
    where: 'DPA D13 sentence on the Mira support-chat providers',
  },
  'subprocessors/subprocessors-registry#1': {
    condition:
      'the Anthropic Team account holder is verified and the past-use disclosure decision is made',
    where: 'Registry row "Anthropic, PBC (Claude, Team plan)"',
  },
  'subprocessors/subprocessors-registry#2': {
    condition:
      'the OpenAI support-chat entity is verified and its terms are confirmed',
    where: 'Registry row "OpenAI" (support-chat fallback)',
  },
} as const satisfies Record<
  string,
  { condition: string; releasable?: false; where: string }
>;

export type HoldId = keyof typeof HOLD_UNITS;

/**
 * The single switch for the AI kill-switch group. Set to `true` only when the
 * `ks` condition above holds; it releases every KS item at once.
 */
export const KS_RELEASED = false;

/** Other released hold units. */
export const RELEASED_HOLDS: readonly HoldId[] = [];

export interface HoldContext {
  mobileReleased?: boolean;
  released?: readonly string[];
}

export function releasedHoldSet({
  mobileReleased = false,
  released,
}: HoldContext = {}): ReadonlySet<string> {
  const ids = new Set<string>(
    released ?? [...RELEASED_HOLDS, ...(KS_RELEASED ? ['ks'] : [])]
  );
  if (mobileReleased) ids.add('mobile');
  for (const id of ids) {
    const unit = HOLD_UNITS[id as HoldId] as { releasable?: false } | undefined;
    if (!unit) throw new Error(`Unknown hold unit: ${id}`);
    if (unit.releasable === false)
      throw new Error(`Hold unit ${id} needs a text change to release`);
  }
  return ids;
}
