import { describe, expect, it } from 'vitest';
import en from '../../../../../messages/en.json';
import vi from '../../../../../messages/vi.json';

// Sign-in agrees to the Terms and Privacy Policy only. Product email is a
// separate onboarding opt-in, off by default (apps/docs/platform/privacy/
// data-protection-standard.mdx).
describe('sign-in consent copy', () => {
  it.each([
    ['en', en.login.legal_notice, /email/iu],
    ['vi', vi.login.legal_notice, /email|thư/iu],
  ])(
    '%s footer names Terms and Privacy, never periodic emails',
    (_, copy, mail) => {
      expect(copy).toMatch(/<terms>[^<]+<\/terms>/u);
      expect(copy).toMatch(/<privacy>[^<]+<\/privacy>/u);
      expect(copy).not.toMatch(mail);
    }
  );
});
