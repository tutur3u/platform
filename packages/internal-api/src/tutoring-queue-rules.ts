import type { TutoringPolicy } from './tutoring-policy';

export interface TutoringFeedbackSnapshot {
  content: string | null;
  createdAt: string;
}

/** Feedback is ordered newest first; compare the current run of equal content. */
export function unchangedFeedbackSince(rows: TutoringFeedbackSnapshot[]) {
  const latest = rows[0];
  if (!latest) return null;
  const currentContent = latest.content?.trim().replace(/\s+/g, ' ') ?? '';
  if (!currentContent) return null;
  let since = latest.createdAt;
  for (const row of rows.slice(1)) {
    if (row.content?.trim().replace(/\s+/g, ' ') !== currentContent) break;
    since = row.createdAt;
  }
  return since;
}

export function isWeakContentReviewDue(
  policy: TutoringPolicy,
  unchangedSince: string | null,
  now = Date.now()
) {
  if (!policy.weakContentReviewDays || !unchangedSince) return false;
  const since = Date.parse(unchangedSince);
  return (
    Number.isFinite(since) &&
    now - since >= policy.weakContentReviewDays * 86_400_000
  );
}
