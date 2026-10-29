// Internal review annotations inherited from the in-force footers (en and vi).
// They are removed from proposal views only; the in-force pages are unchanged.
const INTERNAL_REVIEW_SENTENCE =
  /requires legal review|counsel-review draft|cần được rà soát pháp lý|chờ rà soát pháp lý/iu;

export function stripInternalReviewSentences(footer: string) {
  return footer
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !INTERNAL_REVIEW_SENTENCE.test(sentence))
    .join(' ');
}
