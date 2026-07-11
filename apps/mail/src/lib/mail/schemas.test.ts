import { describe, expect, it } from 'vitest';
import { mailDraftPayloadSchema, sendMailPayloadSchema } from './schemas';

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
});
