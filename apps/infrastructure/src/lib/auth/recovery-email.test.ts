import { describe, expect, it } from 'vitest';
import { renderAuthRecoveryEmail } from './recovery-email';

describe('auth recovery email template', () => {
  it('includes the one-click link, fallback code, expiry, and recipient warning', () => {
    const email = renderAuthRecoveryEmail({
      code: '123456',
      codeUrl: 'https://tuturuuu.com/auth/recovery?email=person%40example.com',
      confirmUrl: 'https://tuturuuu.com/auth/recovery/confirm?token=secret',
      expiresInMinutes: 15,
    });

    expect(email.subject).toContain('recovery login');
    expect(email.text).toContain('123456');
    expect(email.text).toContain('15 minutes');
    expect(email.text).toContain(
      'https://tuturuuu.com/auth/recovery/confirm?token=secret'
    );
    expect(email.html).toContain('123456');
    expect(email.html).toContain('intended recipient');
  });
});
