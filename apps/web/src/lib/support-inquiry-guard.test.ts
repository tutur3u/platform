import { describe, expect, it } from 'vitest';
import {
  createInquirySchema,
  permitsSupportCookieMutation,
} from './support-inquiry-guard';

const payload = {
  name: 'n'.repeat(64),
  email: 'synthetic@example.test',
  type: 'support',
  product: 'web',
  subject: 's'.repeat(128),
  message: 'm'.repeat(512),
};
describe('support inquiry contract', () => {
  it('accepts exact database boundaries', () =>
    expect(createInquirySchema.safeParse(payload).success).toBe(true));
  it.each(['name', 'subject', 'message'])('rejects overlong %s', (field) =>
    expect(
      createInquirySchema.safeParse({
        ...payload,
        [field]: `${payload[field as keyof typeof payload]}x`,
      }).success
    ).toBe(false)
  );
  it('rejects blank messages and normalizes surrounding whitespace', () => {
    expect(
      createInquirySchema.safeParse({ ...payload, message: ' '.repeat(20) })
        .success
    ).toBe(false);
    expect(
      createInquirySchema.parse({
        ...payload,
        message: '  valid support message  ',
      }).message
    ).toBe('valid support message');
  });
  it.each(['name', 'subject', 'message'])(
    'counts Unicode code points for %s',
    (field) => {
      const limit = { name: 64, subject: 128, message: 512 }[field]!;
      const text = '😀'.repeat(limit);
      expect(
        createInquirySchema.safeParse({ ...payload, [field]: text }).success
      ).toBe(true);
      expect(
        createInquirySchema.safeParse({ ...payload, [field]: `${text}😀` })
          .success
      ).toBe(false);
    }
  );
  it('rejects extra email separators', () =>
    expect(
      createInquirySchema.safeParse({ ...payload, email: 'a@b.com@evil' })
        .success
    ).toBe(false));
  const rejectedHeaders: Record<string, string>[] = [
    {},
    { origin: 'https://cross.test' },
    { origin: 'null' },
    { origin: 'https://cross.test', referer: 'https://app.test/good' },
    { authorization: 'Basic invalid', origin: 'https://cross.test' },
  ];
  it.each(rejectedHeaders)(
    'rejects unconfirmed cookie mutations %j',
    (headers) =>
      expect(
        permitsSupportCookieMutation(
          new Request('https://app.test/api/v1/inquiries', {
            headers: { cookie: 'synthetic=invalid', ...headers },
          })
        )
      ).toBe(false)
  );
  const allowedHeaders: Record<string, string>[] = [
    { origin: 'https://app.test' },
    { referer: 'https://app.test/contact' },
    { authorization: 'Bearer synthetic-invalid', origin: 'https://cross.test' },
  ];
  it.each(allowedHeaders)(
    'permits same-origin cookie or independent bearer paths %j',
    (headers) =>
      expect(
        permitsSupportCookieMutation(
          new Request('https://app.test/api/v1/inquiries', {
            headers: { cookie: 'synthetic=invalid', ...headers },
          })
        )
      ).toBe(true)
  );
});
