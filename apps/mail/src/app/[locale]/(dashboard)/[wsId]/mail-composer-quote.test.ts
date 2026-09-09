// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { splitComposerQuote } from './mail-composer-quote';

describe('composer quoted history', () => {
  it('preserves rich quoted HTML outside the editable response through repeated saves', () => {
    const quote =
      '<blockquote type="cite"><table><tbody><tr><td style="padding:12px"><a href="https://example.com">Earlier</a></td></tr></tbody></table></blockquote>';
    const parts = splitComposerQuote(`<p>My reply</p>${quote}`);
    expect(parts.authored).toBe('<p>My reply</p>');
    expect(parts.quoted).toBe(quote);
    expect(splitComposerQuote(`<p>Updated</p>${parts.quoted}`)).toEqual({
      authored: '<p>Updated</p>',
      quoted: quote,
    });
  });
  it('folds an initially empty reply and Gmail history', () => {
    expect(
      splitComposerQuote(
        '<p><br></p><div class="gmail_quote">On Monday wrote:<blockquote>Earlier</blockquote></div>'
      ).quoted
    ).toContain('gmail_quote');
    expect(
      splitComposerQuote(
        '<p><br></p><blockquote type="cite">Earlier</blockquote>'
      ).authored
    ).toBe('<p><br></p>');
  });
  it('keeps authored answers following a bounded quote in their original order', () => {
    const html =
      '<p>Reply</p><blockquote type="cite">Earlier</blockquote><p>Another answer</p>';
    expect(splitComposerQuote(html)).toEqual({ authored: html, quoted: '' });
  });
  it('keeps ambiguous Outlook tails and user-authored quotations editable', () => {
    for (const html of [
      '<p>Reply</p><div id="divRplyFwdMsg">From: Sender</div><p>Earlier</p><p>My answer below</p>',
      '<p>A literary quote:</p><blockquote>Words worth reading</blockquote>',
    ])
      expect(splitComposerQuote(html)).toEqual({ authored: html, quoted: '' });
  });
  it('folds bounded Outlook history', () => {
    const parts = splitComposerQuote(
      '<p>Reply</p><blockquote type="cite"><div id="divRplyFwdMsg">From: Sender</div><p>Earlier</p></blockquote>'
    );
    expect(parts.authored).toBe('<p>Reply</p>');
    expect(parts.quoted).toContain('Earlier');
  });
});
