import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/startup/local_preferences.dart';

void main() {
  test('reads start together and chrome waits for theme only', () async {
    final haptics = Completer<void>();
    final theme = Completer<String>();
    final chrome = Completer<void>();
    final tab = Completer<String?>();
    final app = Completer<String?>();
    final events = <String>[];
    var finished = false;
    final startup =
        loadStartupPreferences(
          initializeHaptics: () {
            events.add('haptics');
            return haptics.future;
          },
          loadTheme: () {
            events.add('theme');
            return theme.future;
          },
          configureChrome: (value) {
            events.add('chrome:$value');
            return chrome.future;
          },
          loadTabRoute: () {
            events.add('tab');
            return tab.future;
          },
          loadAppRoute: () {
            events.add('app');
            return app.future;
          },
        ).then((value) {
          finished = true;
          return value;
        });

    expect(events, ['haptics', 'theme', 'tab', 'app']);
    theme.complete('dark');
    await pumpEventQueue();
    expect(events.last, 'chrome:dark');
    chrome.complete();
    tab.complete('/mail/message');
    app.complete('/mail');
    await pumpEventQueue();
    expect(finished, isFalse);
    haptics.complete();
    expect(await startup, (themeMode: 'dark', initialRoute: '/mail/message'));
  });

  test('missing tab uses app destination', () async {
    final result = await loadStartupPreferences(
      initializeHaptics: () async {},
      loadTheme: () async => 'system',
      configureChrome: (_) async {},
      loadTabRoute: () async => null,
      loadAppRoute: () async => '/apps',
    );
    expect(result, (themeMode: 'system', initialRoute: '/apps'));
  });

  for (final synchronous in [true, false]) {
    test('route error settles other reads (sync=$synchronous)', () async {
      final haptics = Completer<void>();
      final error = StateError('route unavailable');
      final stack = StackTrace.current;
      var surfaced = false;
      var chromeConfigured = false;
      final startup =
          loadStartupPreferences(
            initializeHaptics: () => haptics.future,
            loadTheme: () async => 'light',
            configureChrome: (_) async {
              chromeConfigured = true;
            },
            loadTabRoute: () {
              if (synchronous) Error.throwWithStackTrace(error, stack);
              return Future<String?>.error(error, stack);
            },
            loadAppRoute: () async => '/apps',
          ).then<void>(
            (_) => fail('Expected route failure'),
            onError: (Object actual, StackTrace actualStack) {
              surfaced = true;
              expect(actual, same(error));
              expect(actualStack.toString(), stack.toString());
            },
          );
      await pumpEventQueue();
      expect(chromeConfigured, isTrue);
      expect(surfaced, isFalse);
      haptics.complete();
      await startup;
      expect(surfaced, isTrue);
    });
  }
}
