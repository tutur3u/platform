import {
  findOutlookHistoryHeaders,
  hasOutlookHeaderLines,
} from './mail-outlook-history';

const REPLY_ATTRIBUTION =
  /^(?:on\b[\s\S]{0,500}\bwrote\s*:|(?:vào\s|trong thư trước[,\s])[\s\S]{0,500}(?:đã viết|viết)\s*:)/iu;
function hasVisibleAuthoredContent(document: Document, before: Node) {
  const range = document.createRange();
  range.setStart(document.body, 0);
  range.setEndBefore(before);
  const walker = document.createTreeWalker(document.body, 5);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const element =
      node.nodeType === 1 ? (node as Element) : node.parentElement;
    const media = element?.matches('img,video');
    if (node.nodeType !== 3 && !media) continue;
    if (!media && !node.textContent?.trim()) continue;
    let visible = true;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = document.defaultView?.getComputedStyle(parent);
      if (
        parent.matches('style,script,[hidden]') ||
        style?.display === 'none' ||
        style?.visibility === 'hidden' ||
        style?.visibility === 'collapse' ||
        style?.opacity === '0' ||
        style?.contentVisibility === 'hidden' ||
        (!media && style?.fontSize === '0px') ||
        (style?.overflow === 'hidden' &&
          (style.maxHeight === '0px' || style.height === '0px'))
      ) {
        visible = false;
        break;
      }
    }
    if (visible) return true;
  }
  return false;
}

/** Keep uncertain/quote-only messages intact; this is a reversible reader view. */
export function collapseMailQuotedHistory(document: Document, label: string) {
  const body = document.body;
  if (body.querySelector('[data-mail-quoted-history]')) return;
  const outlookHeaders = findOutlookHistoryHeaders(body);
  const candidates = Array.from(
    body.querySelectorAll<HTMLElement>(
      '.gmail_quote, .gmail_quote_container, #divRplyFwdMsg, #x_divRplyFwdMsg, blockquote, div, p'
    )
  );
  for (const candidate of candidates) {
    const gmail = candidate.matches('.gmail_quote, .gmail_quote_container');
    const outlook =
      /^(?:x_)?divRplyFwdMsg$/iu.test(candidate.id) ||
      outlookHeaders.has(candidate);
    const quote =
      candidate.tagName === 'BLOCKQUOTE' &&
      (candidate.getAttribute('type') === 'cite' ||
        REPLY_ATTRIBUTION.test(candidate.textContent?.trim() ?? '') ||
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
    if (!hasVisibleAuthoredContent(document, start)) return;

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
  if (
    REPLY_ATTRIBUTION.test(text.trimStart()) ||
    hasOutlookHeaderLines(lines) ||
    /^[-_]{2,}\s*(?:original message|forwarded message|thư gốc)\s*[-_]{2,}/iu.test(
      text.trimStart()
    ) ||
    lines.every((line) => !line.trim() || /^\s*>/.test(line))
  ) {
    return { authored: text, quoted: null };
  }
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index]!.trim();
    const attribution =
      /^(?:(?:on|vào)\s|trong thư trước[,\s])/iu.test(line) &&
      REPLY_ATTRIBUTION.test(lines.slice(index, index + 4).join(' '));
    const outlook =
      /^(?:from|từ)\s*:/iu.test(line) && hasOutlookHeaderLines(lines, index);
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
