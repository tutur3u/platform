import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/mail/data/mail_access.dart';

void main() {
  test('Mail is a core app without an experimental toggle', () {
    expect(AppRegistry.coreModuleIds, contains('mail'));
    expect(AppRegistry.experimentalModuleIds, isNot(contains('mail')));
  });
  test('Mail discovery accepts exact Tuturuuu accounts', () {
    for (final email in ['phucvo@tuturuuu.com', 'NAME@TUTURUUU.COM']) {
      expect(canDiscoverMail(email), isTrue, reason: email);
    }
  });
  test('Mail discovery rejects anonymous, external and spoofed domains', () {
    for (final email in [
      null,
      '',
      '@tuturuuu.com',
      'a@gmail.com',
      'a@tuturuuu.com.example.com',
      'a@sub.tuturuuu.com',
      'a@evil.com@tuturuuu.com',
    ]) {
      expect(canDiscoverMail(email), isFalse, reason: email);
    }
  });
}
