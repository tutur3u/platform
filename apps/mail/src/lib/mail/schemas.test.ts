import { describe, expect, it } from 'vitest';
import {
  generateMailAiDraftSchema,
  mailDraftPayloadSchema,
  sendMailPayloadSchema,
  suggestMailLabelsSchema,
} from './schemas';

describe('mail composition schemas', () => {
  it('allows recipient-free autosaved drafts', () => {
    expect(
      mailDraftPayloadSchema.parse({ bodyText: '', subject: '' }).to
    ).toEqual([]);
  });

  it('requires at least one combined recipient before sending', () => {
    expect(
      sendMailPayloadSchema.safeParse({ subject: '', to: [] }).success
    ).toBe(false);
    expect(
      sendMailPayloadSchema.safeParse({
        bcc: ['private@example.com'],
        subject: '',
        to: [],
      }).success
    ).toBe(true);
  });

  it('retains validated recipient display names separately from addresses', () => {
    const payload = mailDraftPayloadSchema.parse({
      recipientDisplayNames: { 'phucvo@tuturuuu.com': 'Võ Hoàng Phúc' },
      subject: 'Hello',
      to: ['phucvo@tuturuuu.com'],
    });

    expect(payload.recipientDisplayNames).toEqual({
      'phucvo@tuturuuu.com': 'Võ Hoàng Phúc',
    });
  });

  it('requires explicit instructions for AI drafts and threads for classification', () => {
    expect(
      generateMailAiDraftSchema.safeParse({ instructions: '', mode: 'draft' })
        .success
    ).toBe(false);
    expect(
      suggestMailLabelsSchema.safeParse({ action: 'classify' }).success
    ).toBe(false);
  });
});
