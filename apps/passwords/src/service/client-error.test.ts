import { describe, expect, it } from 'vitest';
import { asClientError, PasswordsClientError, unwrap } from './client-error';

describe('client errors', () => {
  it('unwraps success and throws a typed failure with step-up details', () => {
    expect(unwrap({ ok: true, value: 7 })).toBe(7);
    try {
      unwrap({
        ok: false,
        code: 'STEP_UP_REQUIRED',
        stepUpUrl: 'https://x/step',
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PasswordsClientError);
      expect((error as PasswordsClientError).stepUpUrl).toBe('https://x/step');
    }
  });

  it('treats a transport failure of a write as uncertain, of a read as unavailable', () => {
    expect(asClientError(new Error('network'), true).code).toBe(
      'OPERATION_UNCERTAIN'
    );
    expect(asClientError(new Error('network'), false).code).toBe('UNAVAILABLE');
  });
});
