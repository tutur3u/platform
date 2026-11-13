import { describe, expect, it } from 'vitest';
import {
  LoginEmailModePreference,
  processEmailInput,
} from './login-email-mode';

describe('login presentation preference', () => {
  it.each([
    '@tuturuuu.com',
    'person@@tuturuuu.com',
    'person name@tuturuuu.com',
    'person name@tutur3u.com',
    'person\tname@tuturuuu.com',
    'person\tname@tutur3u.com',
    'person\nname@tuturuuu.com',
    'person\nname@tutur3u.com',
    'person@sub.tutur3u.com',
    'person@tuturuuu.com.',
    'person@tuturuuu.com.evil.test',
    'person@tutur3u.com.evil.test',
    'person@tuturuuυ.com',
  ])('rejects malformed or lookalike input %s', (email) => {
    expect(new LoginEmailModePreference().resolve(email, true)).toBe('otp');
  });

  it.each([' \tPerson@TUTURUUU.COM\n ', ' \tPerson@TUTUR3U.COM\n '])(
    'trims outer whitespace without rejecting a valid address %s',
    (email) => {
      expect(new LoginEmailModePreference().resolve(email, true)).toBe(
        'password'
      );
    }
  );

  it('preserves existing web username shorthand before applying the preference', () => {
    const email = processEmailInput(' Person ');
    expect(email).toBe('Person@tuturuuu.com');
    expect(new LoginEmailModePreference().resolve(email, true)).toBe(
      'password'
    );
  });

  it('gives OTP disablement precedence over an explicit code choice without erasing it', () => {
    const preference = new LoginEmailModePreference();
    preference.choose(' Person@TUTUR3U.COM ', 'otp');
    expect(preference.resolve('person@tutur3u.com', false)).toBe('password');
    expect(preference.resolve('person@tutur3u.com', true)).toBe('otp');
  });
});
