import type { MailMailbox } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  applyAiDraftToBody,
  buildComposerInitialBody,
  getComposerWarnings,
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
