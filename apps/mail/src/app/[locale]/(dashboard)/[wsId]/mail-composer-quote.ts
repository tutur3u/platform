import { REPLY_ATTRIBUTION } from './mail-quoted-history';

/** Only bounded history belongs outside the editor; ambiguous Outlook tails stay editable. */
export function splitComposerQuote(html: string) {
  if (typeof DOMParser === 'undefined') return { authored: html, quoted: '' };
  const document = new DOMParser().parseFromString(html, 'text/html');
  const body = document.body;
  const candidates = body.querySelectorAll(
    '.gmail_quote, .gmail_quote_container, blockquote'
  );
  for (const quote of candidates) {
    let start = quote;
    const previous = quote.previousElementSibling;
    const attribution = REPLY_ATTRIBUTION.test(quote.textContent?.trim() ?? '');
    const previousAttribution = REPLY_ATTRIBUTION.test(
      previous?.textContent?.trim() ?? ''
    );
    if (
      !quote.matches(
        '.gmail_quote, .gmail_quote_container, blockquote[type="cite"]'
      ) &&
      !attribution &&
      !previousAttribution
    )
      continue;
    if (previous && previousAttribution) start = previous;
    const following = document.createRange();
    following.setStartAfter(quote);
    following.setEnd(body, body.childNodes.length);
    const tail = following.cloneContents();
    if (tail.textContent?.trim() || tail.querySelector('img,video,hr'))
      continue;
    const range = document.createRange();
    range.setStartBefore(start);
    range.setEndAfter(quote);
    const container = document.createElement('div');
    container.append(range.extractContents());
    return { authored: body.innerHTML, quoted: container.innerHTML };
  }
  return { authored: html, quoted: '' };
}
