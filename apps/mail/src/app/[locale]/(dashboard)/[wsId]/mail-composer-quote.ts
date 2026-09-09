import { collapseMailQuotedHistory } from './mail-quoted-history';

/** Keep history outside Tiptap so tables, links and inline styles survive edits. */
export function splitComposerQuote(html: string) {
  if (typeof DOMParser === 'undefined') return { authored: html, quoted: '' };
  const document = new DOMParser().parseFromString(html, 'text/html');
  const body = document.body;
  // Replies can initially consist entirely of history and an empty input line.
  const sentinel = document.createElement('p');
  sentinel.textContent = 'composer';
  body.prepend(sentinel);
  collapseMailQuotedHistory(document, '');
  sentinel.remove();
  const details = body.querySelector('details[data-mail-quoted-history]');
  let quote: Element | null = details;
  if (!quote)
    quote = body.lastElementChild?.matches('blockquote')
      ? body.lastElementChild
      : null;
  if (!quote) return { authored: html, quoted: '' };
  const following = document.createRange();
  following.setStartAfter(quote);
  following.setEnd(body, body.childNodes.length);
  const tail = following.cloneContents();
  // Do not reorder inline replies or discard media following a bounded quote.
  if (tail.textContent?.trim() || tail.querySelector('img,video,hr'))
    return { authored: html, quoted: '' };
  if (details) details.querySelector(':scope > summary')?.remove();
  const quoted = details ? details.innerHTML : quote.outerHTML;
  quote.remove();
  return { authored: body.innerHTML, quoted };
}
