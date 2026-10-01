import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/utils/login_email_mode.dart';

void main() {
  test('domain preference rejects malformed and lookalike input', () {
    final preference = LoginEmailModePreference();
    for (final email in [
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
    ]) {
      expect(
        preference.resolve(email, otpEnabled: true),
        LoginEmailMode.otp,
        reason: email,
      );
    }
  });
  test('outer whitespace is trimmed for both exact domains', () {
    final preference = LoginEmailModePreference();
    for (final domain in ['TUTURUUU.COM', 'TUTUR3U.COM']) {
      expect(
        preference.resolve(' \tPerson@$domain\n ', otpEnabled: true),
        LoginEmailMode.password,
      );
    }
  });

  test('OTP disablement overrides a code choice without erasing it', () {
    final preference = LoginEmailModePreference()
      ..choose(' Person@TUTUR3U.COM ', LoginEmailMode.otp);
    expect(
      preference.resolve('person@tutur3u.com', otpEnabled: false),
      LoginEmailMode.password,
    );
    expect(
      preference.resolve('person@tutur3u.com', otpEnabled: true),
      LoginEmailMode.otp,
    );
  });
}
