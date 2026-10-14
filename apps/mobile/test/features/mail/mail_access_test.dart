import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/mail/data/mail_access.dart';

void main() {
  test('Mail requires an experimental toggle in addition to access', () {
    expect(AppRegistry.coreModuleIds, isNot(contains('mail')));
    expect(AppRegistry.experimentalModuleIds, contains('mail'));
  });
  test('Mail discovery accepts exact Tuturuuu accounts', () {
    for (final email in ['phucvo@tuturuuu.com', 'NAME@TUTURUUU.COM']) {
      expect(canDiscoverMail(email), isTrue, reason: email);
    }
  });
  test(
    'Mail discovery admits DNS descendants only as an API-authorized hint',
    () {
      for (final email in [
        'owner@team.tuturuuu.com',
        'OWNER@NORTH.TEAM.TUTURUUU.COM',
      ]) {
        expect(canDiscoverMail(email), isTrue, reason: email);
      }
      for (final email in [
        'owner@-team.tuturuuu.com',
        'owner@team-.tuturuuu.com',
        'owner@team..tuturuuu.com',
        'owner@tuturuuu.com.evil.test',
      ]) {
        expect(canDiscoverMail(email), isFalse, reason: email);
      }
    },
  );
  test('Mail discovery requires a reviewer tag on the routed domain', () {
    const reviewer = {
      'infrastructure_review_account': {'kind': 'review'},
    };
    expect(
      canDiscoverMail('app-review-ios@tutur3u.com', appMetadata: reviewer),
      isTrue,
    );
    expect(canDiscoverMail('app-review-ios@tutur3u.com'), isFalse);
    expect(
      canDiscoverMail(
        'tester@tutur3u.com',
        appMetadata: {
          'infrastructure_review_account': {'kind': 'external'},
        },
      ),
      isFalse,
    );
  });
  test('Mail discovery rejects anonymous, external and spoofed domains', () {
    for (final email in [
      null,
      '',
      '@tuturuuu.com',
      'a@gmail.com',
      'a@tuturuuu.com.example.com',
      'a@evil.com@tuturuuu.com',
    ]) {
      expect(canDiscoverMail(email), isFalse, reason: email);
    }
  });
}
