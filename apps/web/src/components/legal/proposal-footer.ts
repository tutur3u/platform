// Internal review annotations inherited from the in-force footers (en and vi).
// They are removed from proposal views only; the in-force pages are unchanged.
const INTERNAL_REVIEW_SENTENCE =
  /requires legal review|counsel-review draft|cần được rà soát pháp lý|chờ rà soát pháp lý/iu;

export function stripInternalReviewSentences(footer: string) {
  return footer
    .replace(
      'Draft revision for review; not a newly effective agreement.',
      'Not yet in effect.'
    )
    .replace(
      'Bản sửa đổi để rà soát; chưa phải thỏa thuận mới có hiệu lực.',
      'Chưa có hiệu lực.'
    )
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !INTERNAL_REVIEW_SENTENCE.test(sentence))
    .join(' ');
}
