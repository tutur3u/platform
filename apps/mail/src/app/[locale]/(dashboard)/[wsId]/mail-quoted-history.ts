const REPLY_ATTRIBUTION =
  /^(?:on\b[\s\S]{0,500}\bwrote\s*:|(?:vào\s|trong thư trước[,\s])[\s\S]{0,500}(?:đã viết|viết)\s*:)/iu;
const OUTLOOK_HEADERS =
  /^(?:from|từ)\s*:[\s\S]{1,1000}(?:sent|date|đã gửi|ngày)\s*:[\s\S]{1,1000}(?:to|đến)\s*:[\s\S]{1,1000}(?:subject|chủ đề)\s*:/iu;

/** Keep uncertain/quote-only messages intact; this is a reversible reader view. */
export function collapseMailQuotedHistory(document: Document, label: string) {
  const body = document.body;
  if (body.querySelector('[data-mail-quoted-history]')) return;
  const candidates = Array.from(
    body.querySelectorAll<HTMLElement>(
      '.gmail_quote, .gmail_quote_container, #divRplyFwdMsg, #x_divRplyFwdMsg, blockquote, div, p'
    )
  );
  for (const candidate of candidates) {
    const text = candidate.textContent?.trim() ?? '';
    const gmail = candidate.matches('.gmail_quote, .gmail_quote_container');
    const outlook =
      /^(?:x_)?divRplyFwdMsg$/iu.test(candidate.id) ||
      (OUTLOOK_HEADERS.test(text) &&
        !Array.from(candidate.children).some((child) =>
          OUTLOOK_HEADERS.test(child.textContent?.trim() ?? '')
        ));
    const quote =
      candidate.tagName === 'BLOCKQUOTE' &&
      (candidate.getAttribute('type') === 'cite' ||
        REPLY_ATTRIBUTION.test(text) ||
        REPLY_ATTRIBUTION.test(
          candidate.previousElementSibling?.textContent?.trim() ?? ''
        ));
    if (!gmail && !outlook && !quote) continue;
    let start: Node = candidate;
    if (
      quote &&
      REPLY_ATTRIBUTION.test(
        candidate.previousElementSibling?.textContent?.trim() ?? ''
      )
    ) {
      start = candidate.previousElementSibling!;
    }
    const prefix = document.createRange();
    prefix.setStart(body, 0);
    prefix.setEndBefore(start);
    const authored = prefix.cloneContents();
    for (const hidden of authored.querySelectorAll('style, script, [hidden]'))
      hidden.remove();
    if (!authored.textContent?.trim() && !authored.querySelector('img,video'))
      continue;

    const details = document.createElement('details');
    details.setAttribute('data-mail-quoted-history', '');
    const summary = document.createElement('summary');
    summary.textContent = label;
    details.append(summary);
    if (outlook) {
      // Outlook places its header and quoted body in separate siblings, often
      // nested in Word-generated wrappers. Range keeps that markup intact.
      const history = document.createRange();
      history.setStartBefore(start);
      history.setEnd(body, body.childNodes.length);
      const fragment = history.extractContents();
      history.insertNode(details);
      details.append(fragment);
    } else {
      start.parentNode!.insertBefore(details, start);
      if (start !== candidate) details.append(start);
      details.append(candidate);
    }
    return;
  }
}

export function splitMailQuotedText(text: string) {
  const lines = text.split('\n');
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index]!.trim();
    const attribution =
      /^(?:(?:on|vào)\s|trong thư trước[,\s])/iu.test(line) &&
      REPLY_ATTRIBUTION.test(lines.slice(index, index + 4).join(' '));
    const outlook =
      /^(?:from|từ)\s*:/iu.test(line) &&
      OUTLOOK_HEADERS.test(lines.slice(index, index + 20).join('\n'));
    const separator =
      /^[-_]{2,}\s*(?:original message|forwarded message|thư gốc)\s*[-_]{2,}$/iu.test(
        line
      );
    const quotedLines =
      /^>/.test(line) &&
      lines.slice(index).every((value) => !value.trim() || /^\s*>/.test(value));
    if (!attribution && !separator && !quotedLines && !outlook) continue;
    const authored = lines.slice(0, index).join('\n').trimEnd();
    if (authored.trim())
      return { authored, quoted: lines.slice(index).join('\n') };
  }
  return { authored: text, quoted: null };
}
