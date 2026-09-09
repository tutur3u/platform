import type { MailMailbox, MailMessageDetail } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  applyAiDraftToBody,
  buildComposerInitialBody,
  getComposerWarnings,
  mailHtmlToText,
  toComposeInitialDraft,
} from './mail-composer-utils';

const mailbox = {
  signatureHtml: '<p><strong>Võ Hoàng Phúc</strong><br>Tuturuuu</p>',
  signatureText: 'Võ Hoàng Phúc\nTuturuuu',
} as MailMailbox;

describe('buildComposerInitialBody', () => {
  it('adds an editable signature to a new message', () => {
    const body = buildComposerInitialBody(null, mailbox);

    expect(body.html).toContain('data-mail-signature="true"');
    expect(body.html).toContain('Võ Hoàng Phúc');
    expect(body.text).toContain('-- \nVõ Hoàng Phúc');
  });

  it('places the signature before quoted reply content', () => {
    const body = buildComposerInitialBody(
      {
        bodyHtml: '<p><br></p><blockquote><p>Earlier message</p></blockquote>',
      },
      mailbox
    );

    expect(body.html.indexOf('data-mail-signature')).toBeLessThan(
      body.html.indexOf('<blockquote>')
    );
  });
});

describe('applyAiDraftToBody', () => {
  it('preserves the editable signature and quoted thread context', () => {
    const existing =
      '<p>Old draft</p><div data-mail-signature="true"><p>--</p><p>Phúc</p></div><blockquote><p>Earlier</p></blockquote>';

    const result = applyAiDraftToBody(existing, 'New draft\n\nThank you.');

    expect(result).toContain('<p>New draft</p>');
    expect(result).toContain('data-mail-signature="true"');
    expect(result).toContain('<blockquote><p>Earlier</p></blockquote>');
    expect(result).not.toContain('Old draft');
    expect(mailHtmlToText(result)).toContain('Phúc');
    expect(mailHtmlToText(result)).toContain('Earlier');
  });
});

describe('getComposerWarnings', () => {
  it('detects missing subject, authored content, and mentioned attachments', () => {
    expect(
      getComposerWarnings({
        attachmentCount: 0,
        bodyHtml: '<p>I attached the revised brief.</p>',
        signatureText: mailbox.signatureText,
        subject: '',
      })
    ).toEqual(['empty_subject', 'missing_attachment']);
  });

  it('treats a signature-only draft as an empty message', () => {
    const body = buildComposerInitialBody(null, mailbox);

    expect(
      getComposerWarnings({
        attachmentCount: 0,
        bodyHtml: body.html,
        signatureText: mailbox.signatureText,
        subject: 'Hello',
      })
    ).toContain('empty_message');
  });

  it('recognizes an HTML-only signature after the editor normalizes markup', () => {
    expect(
      getComposerWarnings({
        attachmentCount: 0,
        bodyHtml: '<p>--</p><p><strong>Tuturuuu Mail</strong></p>',
        signatureHtml: '<p><strong>Tuturuuu Mail</strong></p>',
        signatureText: null,
        subject: 'Hello',
      })
    ).toContain('empty_message');
  });

  it('ignores attachment language inside quoted messages', () => {
    expect(
      getComposerWarnings({
        attachmentCount: 0,
        bodyHtml:
          '<p>Thanks.</p><blockquote><p>I attached the old file.</p></blockquote>',
        signatureText: null,
        subject: 'Re: update',
      })
    ).toEqual([]);
  });
});

describe('plain-text composer payload', () => {
  it('decodes escaped text without turning it into markup', () => {
    expect(
      mailHtmlToText('<p>R&amp;D &lt;report&gt; &quot;ready&quot;</p>')
    ).toBe('R&D <report> "ready"');
  });
});

describe('draft resume metadata', () => {
  it('preserves identity, attachments and thread context without promoting the no-subject placeholder', () => {
    const draft = toComposeInitialDraft({
      id: 'draft',
      mailboxId: 'mailbox',
      threadId: 'thread',
      subject: '(no subject)',
      bodyHtml: '<p>Reply</p>',
      bodyText: 'Reply',
      attachments: [
        { id: 'inline-image', contentId: 'logo', disposition: 'inline' },
      ],
      recipients: [
        {
          kind: 'to',
          address: 'recipient@example.com',
          displayName: 'Recipient',
        },
      ],
      references: ['parent'],
      inReplyTo: 'parent',
    } as unknown as MailMessageDetail);
    expect(draft).toMatchObject({
      draftId: 'draft',
      bodyHtml: '<p>Reply</p>',
      bodyText: 'Reply',
      attachments: [
        { id: 'inline-image', contentId: 'logo', disposition: 'inline' },
      ],
      mailboxId: 'mailbox',
      threadId: 'thread',
      subject: '',
      to: ['recipient@example.com'],
      references: ['parent'],
      inReplyTo: 'parent',
    });
  });
  it('decodes numeric references without a browser parser', () => {
    expect(mailHtmlToText('<p>It&#39;s &#x1f44d;</p>')).toBe("It's \u{1f44d}");
  });
});
