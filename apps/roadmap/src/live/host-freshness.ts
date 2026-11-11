/**
 * How current an app's deployed commit is, for the hosting cards.
 * A reported commit with an unknown lag is neither current nor behind: it
 * returns null, so the card shows the commit and makes no claim.
 */
export function hostFreshness(host: {
  commit: string | null;
  behindBy: number | null;
}): 'current' | 'behind' | 'unknown' | null {
  if (!host.commit) return 'unknown';
  if (host.behindBy === 0) return 'current';
  if (host.behindBy) return 'behind';
  return null;
}
