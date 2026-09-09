/** Display-only normalization; keep stored/sent text and meaningful indentation intact. */
export function readableMailText(text: string) {
  return text.replaceAll('\r\n', '\n').replace(/\n(?:[\t ]*\n){2,}/gu, '\n\n');
}
