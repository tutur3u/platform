import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('defaults safely and persists both explicit choices', () async {
    expect(await readLinkBrowserPreference(), LinkBrowserPreference.builtIn);
    for (final preference in LinkBrowserPreference.values) {
      await saveLinkBrowserPreference(preference);
      expect(await readLinkBrowserPreference(), preference);
    }
    SharedPreferences.setMockInitialValues({
      'link-browser-preference': 'unknown',
    });
    expect(await readLinkBrowserPreference(), LinkBrowserPreference.builtIn);
  });

  for (final preference in LinkBrowserPreference.values) {
    for (final scheme in ['http', 'https']) {
      test(
        '$scheme honors ${preference.name} without losing URI details',
        () async {
          await saveLinkBrowserPreference(preference);
          final uri = Uri.parse(
            '$scheme://example.test/notes?a=one%20two#section',
          );
          var calls = 0;
          expect(
            await launchMobileLink(
              uri,
              launch: (received, mode) async {
                calls++;
                expect(received, uri);
                expect(
                  mode,
                  preference == LinkBrowserPreference.builtIn
                      ? LaunchMode.inAppBrowserView
                      : LaunchMode.externalApplication,
                );
                return true;
              },
            ),
            isTrue,
          );
          expect(calls, 1);
        },
      );
    }
  }

  for (final link in [
    'mailto:person@example.test',
    'tel:+123456789',
    'sms:+123456789',
  ]) {
    test(
      '$link uses its system handler without reading browser preference',
      () async {
        expect(
          await launchMobileLink(
            Uri.parse(link),
            readPreference: () async {
              throw StateError('Should not read preference');
            },
            launch: (_, mode) async {
              expect(mode, LaunchMode.externalApplication);
              return true;
            },
          ),
          isTrue,
        );
      },
    );
  }

  for (final link in [
    'javascript:alert(1)',
    'file:///private/file',
    '/relative',
    'https:/missing-host',
    'https://name:secret@example.test',
  ]) {
    test('does not launch unsafe or incomplete URI $link', () async {
      expect(
        await launchMobileLink(
          Uri.parse(link),
          launch: (_, _) async {
            fail('Invalid link reached launcher');
          },
        ),
        isFalse,
      );
    });
  }

  test('returns launcher failure without switching chosen browser', () async {
    var calls = 0;
    expect(
      await launchMobileLink(
        Uri.parse('https://example.test'),
        launch: (_, mode) async {
          calls++;
          expect(mode, LaunchMode.inAppBrowserView);
          return false;
        },
      ),
      isFalse,
    );
    expect(calls, 1);
  });
  test('preference failure does not launch or expose native details', () async {
    var calls = 0;
    expect(
      await launchMobileLink(
        Uri.parse('https://example.test'),
        readPreference: () async =>
            throw StateError('private synthetic detail'),
        launch: (_, _) async {
          calls++;
          return true;
        },
      ),
      isFalse,
    );
    expect(calls, 0);
  });

  test(
    'native exception is a failed launch with no alternate mode attempt',
    () async {
      var calls = 0;
      expect(
        await launchMobileLink(
          Uri.parse('https://example.test'),
          launch: (_, _) async {
            calls++;
            throw StateError('private synthetic detail');
          },
        ),
        isFalse,
      );
      expect(calls, 1);
    },
  );
}
