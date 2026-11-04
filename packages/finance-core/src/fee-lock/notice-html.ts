// Selene gate (1): a rendered notice is PLAIN TEXT. Any sender that puts it in
// HTML (an email body, an in-app message) must escape it with this helper, and
// may only add markup around the escaped text; never insert it raw.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes a rendered notice for HTML; line breaks become `<br>`. */
export function escapeFeeNoticeHtml(text: string) {
  return text
    .replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
    .replace(/\r?\n/g, '<br>');
}
