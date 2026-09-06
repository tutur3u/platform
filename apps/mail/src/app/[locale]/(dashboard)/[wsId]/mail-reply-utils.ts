export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function replySubject(subject: string) {
  return /^re:/iu.test(subject.trim())
    ? subject
    : `Re: ${subject || ''}`.trim();
}

export function forwardSubject(subject: string) {
  return /^(fw|fwd):/iu.test(subject.trim())
    ? subject
    : `Fwd: ${subject || ''}`.trim();
}
