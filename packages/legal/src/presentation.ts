export function liveLegalFooter(footer: string) {
  return footer
    .replace(
      ' This draft requires legal review before production publication.',
      ''
    )
    .replace('These Terms are a counsel-review draft. ', '')
    .replace(/[^.]*bản (?:dự thảo|nháp)[^.]*\./giu, '')
    .trim();
}
