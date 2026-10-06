import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/deep_link_launcher.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  group('launchExternalMobileDeepLink', () {
    test('uses in-app browser mode for app-link opt-outs', () async {
      final uri = Uri.parse(
        'https://tuturuuu.com/personal/tasks?openInBrowser=1',
      );
      Uri? launchedUri;
      LaunchMode? launchedMode;

      final launched = await launchExternalMobileDeepLink(
        uri,
        readPreference: () async => LinkBrowserPreference.builtIn,
        launch: (uri, mode) async {
          launchedUri = uri;
          launchedMode = mode;
          return true;
        },
      );

      expect(launched, isTrue);
      expect(launchedUri, uri);
      expect(launchedMode, LaunchMode.inAppBrowserView);
      expect(launchedMode, isNot(LaunchMode.externalApplication));
    });
    test('honors external preference for app-link opt-outs', () async {
      LaunchMode? launchedMode;
      final launched = await launchExternalMobileDeepLink(
        Uri.parse('https://tuturuuu.com/personal/tasks?openInBrowser=1'),
        readPreference: () async => LinkBrowserPreference.external,
        launch: (uri, mode) async {
          launchedMode = mode;
          return true;
        },
      );
      expect(launched, isTrue);
      expect(launchedMode, LaunchMode.externalApplication);
    });
  });
}
