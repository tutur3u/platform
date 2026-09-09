// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeMailHtml } from '@/lib/mail/html';
import {
  collapseMailQuotedHistory,
  splitMailQuotedText,
} from './mail-quoted-history';

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  document.body.innerHTML = '';
});
function render(html: string) {
  document.body.innerHTML = sanitizeMailHtml(html, { isolatedDocument: true });
  collapseMailQuotedHistory(document, 'Quoted text');
  return document.querySelector('details');
}

describe('quoted HTML history', () => {
  it('collapses Gmail history while preserving new reply and trailing inline answer', () => {
    const details = render(
      '<p>New reply</p><div class="gmail_quote"><div class="gmail_attr">On Monday, Lan wrote:</div><blockquote>Previous message<div class="gmail_quote">Older reply</div></blockquote></div><p>Additional answer</p>'
    );
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain('Previous message');
    expect(details?.textContent).toContain('Older reply');
    expect(details?.textContent).not.toContain('Additional answer');
    expect(document.body.lastElementChild?.textContent).toBe(
      'Additional answer'
    );
    collapseMailQuotedHistory(document, 'Quoted text');
    expect(document.querySelectorAll('details')).toHaveLength(1);
  });
  it.each(['divRplyFwdMsg', 'x_divRplyFwdMsg'])(
    'retains Outlook marker %s and collapses following sibling history',
    (id) => {
      const details = render(
        `<div><p>New reply</p><div id="${id}"><b>From:</b> Lan<br>Sent: Monday<br>To: Minh<br>Subject: Update</div><p>Previous message</p></div>`
      );
      expect(details?.textContent).toContain('Previous message');
      expect(details?.textContent).not.toContain('New reply');
      expect(document.querySelector('p')?.textContent).toBe('New reply');
    }
  );
  it('recognizes legacy Outlook header blocks even after ids were stripped', () => {
    const details = render(
      '<p>Thanks</p><div><b>From:</b> Lan<br><b>Sent:</b> Monday<br><b>To:</b> Minh<br><b>Subject:</b> Update</div><p>Old body</p>'
    );
    expect(details?.textContent).toContain('Old body');
  });
  it('collapses Tuturuuu reply history shown in the screenshot', () => {
    const details = render(
      '<p>Thank you for the notification.</p><blockquote><p>On an earlier message, The Google Workspace Team wrote:</p><h1>Data remediation completed</h1></blockquote>'
    );
    expect(details?.textContent).toContain('Data remediation completed');
    expect(details?.textContent).not.toContain('Thank you');
  });
  it('recognizes cite quotes and keeps attribution with the history', () => {
    const details = render(
      '<p>Thanks</p><p>On Monday, Lan wrote:</p><blockquote type="cite">Old body</blockquote>'
    );
    expect(details?.textContent).toContain('On Monday');
    expect(details?.textContent).toContain('Old body');
  });
  it('keeps standalone blockquotes and quote-only messages visible', () => {
    expect(
      render(
        '<p>A literary quote:</p><blockquote>Words worth reading</blockquote>'
      )
    ).toBeNull();
    expect(
      render('<div class="gmail_quote">The entire imported message</div>')
    ).toBeNull();
  });
  it('does not mistake retained styles for a new authored reply', () => {
    expect(
      render(
        '<style>p {color:red}</style><div class="gmail_quote">Only original content</div>'
      )
    ).toBeNull();
  });
  it.each([
    '<div style="display:none">Hidden preheader</div>',
    '<style>.preheader{display:none}</style><div class="preheader">Hidden preheader</div>',
    '<div style="max-height:0;overflow:hidden;opacity:0">Hidden preheader</div>',
  ])('leaves quote-only HTML visible after hidden preheaders', (preheader) => {
    expect(
      render(`${preheader}<div class="gmail_quote">Only original content</div>`)
    ).toBeNull();
  });
  it('does not confuse authored prose with Outlook header lines', () => {
    expect(
      render(
        '<p>Hello</p><p>From: our team, sent: yesterday, to: your team, subject: next steps.</p><p>Important new content.</p>'
      )
    ).toBeNull();
  });
  it('keeps quote markers scoped to isolated reader sanitization', () => {
    const source =
      '<blockquote type="cite" id="divRplyFwdMsg">Old message</blockquote>';
    expect(sanitizeMailHtml(source)).not.toMatch(/type=|id=/);
    expect(sanitizeMailHtml(source, { isolatedDocument: true })).toContain(
      'type="cite"'
    );
  });
  it('does not treat attribution inside quote-only Gmail mail as an authored reply', () => {
    expect(
      render(
        '<div class="gmail_quote"><p>On Monday, Lan wrote:</p><blockquote type="cite">Only original content</blockquote></div>'
      )
    ).toBeNull();
  });
  it('supports long folded Outlook recipient fields', () => {
    const recipients = Array.from(
      { length: 30 },
      (_, i) => `Recipient ${i}`
    ).join('<br>');
    const details = render(
      `<p>Thanks</p><div>From: Lan<br>Sent: Monday<br>To: ${recipients}<br>Subject: Update</div><p>Old body</p>`
    );
    expect(details?.textContent).toContain('Old body');
    expect(
      splitMailQuotedText(
        `Thanks\n\nFrom: Lan\nSent: Monday\nTo: ${recipients.replaceAll('<br>', '\n')}\nSubject: Update\nOld body`
      ).quoted
    ).toContain('Old body');
  });
  it('normalizes structured inline Outlook labels without matching prose', () => {
    const details = render(
      '<p>Thanks</p><div><b>From:</b> Lan <b>Sent:</b> Monday <b>To:</b> Minh <b>Subject:</b> Update</div><p>Old body</p>'
    );
    expect(details?.textContent).toContain('Old body');
  });
  it('does not clone overlapping newsletter subtrees while finding headers', () => {
    document.body.innerHTML = `${'<div>'.repeat(100)}<p>Newsletter body</p>${'</div>'.repeat(100)}`;
    const clone = vi.spyOn(Node.prototype, 'cloneNode');
    collapseMailQuotedHistory(document, 'Quoted text');
    expect(clone).not.toHaveBeenCalled();
  });
  it('collapses table-based Outlook headers without placing details inside a table', () => {
    const details = render(
      '<p>New reply</p><table><tr><td>From: Lan<br>Sent: Monday<br>To: Minh<br>Subject: Update</td></tr></table><p>Old body</p>'
    );
    expect(details?.parentElement).toBe(document.body);
    expect(details?.querySelector('table')).not.toBeNull();
    expect(document.body.querySelectorAll('table')).toHaveLength(1);
    expect(details?.textContent).toContain('Old body');
    expect(details?.textContent).not.toContain('New reply');
  });
  it('recognizes Outlook fields spread across table rows', () => {
    const details = render(
      '<p>New reply</p><table><tr><td>From:</td><td>Lan</td></tr><tr><td>Sent:</td><td>Monday</td></tr><tr><td>To:</td><td>Minh</td></tr><tr><td>Subject:</td><td>Update</td></tr></table><p>Old body</p>'
    );
    expect(details?.textContent).toContain('Old body');
    expect(details?.parentElement).toBe(document.body);
  });
  it('keeps authored table rows outside quoted history', () => {
    const details = render(
      '<table><tr><td>New reply</td></tr><tr><td>From: Lan<br>Sent: Monday<br>To: Minh<br>Subject: Update</td></tr><tr><td>Old body</td></tr></table>'
    );
    expect(details?.textContent).toContain('Old body');
    expect(details?.textContent).not.toContain('New reply');
    expect(details?.parentElement).toBe(document.body);
  });
  it.each([
    'From: Lan<br>Sent: Monday<br>To: Minh<br>Subject: Update',
    '<div>From: Lan<br>Sent: Monday<br>To: Minh<br>Subject: Update</div>',
  ])('keeps replies after Outlook blockquotes visible', (header) => {
    const details = render(
      `<p>New reply</p><blockquote>${header}<p>Old body</p></blockquote><p>Additional answer</p>`
    );
    expect(details?.textContent).toContain('Old body');
    expect(details?.textContent).not.toContain('Additional answer');
    expect(document.body.lastElementChild?.textContent).toBe(
      'Additional answer'
    );
  });
  it('does not restore executable content while preserving quote markers', () => {
    render(
      '<p>Thanks</p><div id="divRplyFwdMsg" onclick="alert(1)">From: Lan</div><script>alert(1)</script><img src="javascript:alert(1)">'
    );
    expect(document.querySelector('script,[onclick],img[src]')).toBeNull();
  });
});

describe('quoted plain text', () => {
  it.each([
    'On Monday, Lan wrote:\n> Old message',
    'Trong thư trước, Lan đã viết:\n> Thư cũ',
    'Vào thứ Hai, Lan đã viết:\n> Thư cũ',
    'On Monday,\nLan wrote:\n> Old message',
    '-----Original Message-----\nFrom: Lan\nOld message',
    'From: Lan\nSent: Monday\nTo: Minh\nSubject: Update\nOld message',
    '> Old message\n> Older message',
  ])('separates reply from %s', (history) => {
    expect(splitMailQuotedText(`New reply\n\n${history}`)).toEqual({
      authored: 'New reply',
      quoted: history,
    });
  });
  it('preserves inline answers and quote-only mail', () => {
    const inline = 'Reply\n> question\nMy answer';
    expect(splitMailQuotedText(inline).quoted).toBeNull();
    expect(
      splitMailQuotedText('On Monday, Lan wrote:\n> Only original text').quoted
    ).toBeNull();
    expect(splitMailQuotedText('> Only original text').quoted).toBeNull();
    expect(
      splitMailQuotedText('> Only original text\n> Second line').quoted
    ).toBeNull();
  });
});
