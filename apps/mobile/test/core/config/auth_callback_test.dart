import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/auth_callback.dart';

void main() {
  test('preserves registered flavor callbacks', () {
    for (final suffix in ['', '.dev', '.stg']) {
      final name = 'com.tuturuuu.app.mobile$suffix';
      expect(authCallbackUrl(name), '$name://login-callback');
    }
  });

  test('uses the registered desktop protocol for executable metadata', () {
    for (final name in [
      '',
      'mobile',
      'tuturuuu',
      'Tuturuuu',
      'https://evil.test',
    ]) {
      expect(authCallbackUrl(name), 'com.tuturuuu.app.mobile://login-callback');
    }
  });
}
