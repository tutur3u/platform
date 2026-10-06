import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';

import 'package:mobile/l10n/l10n.dart';

void main() {
  for (final language in ['en', 'vi']) {
    for (final failure in ['false', 'native', 'preference']) {
      testWidgets('$language $failure failure is safe and visible', (
        tester,
      ) async {
        await _pumpFeedback(
          tester,
          Builder(
            builder: (context) => TextButton(
              onPressed: () => unawaited(
                openMobileLink(
                  context,
                  Uri.parse('https://example.test/private'),
                  readPreference: () async {
                    if (failure == 'preference') {
                      throw StateError('sensitive synthetic detail');
                    }
                    return LinkBrowserPreference.external;
                  },
                  launch: (_, _) async {
                    if (failure == 'native') {
                      throw StateError('sensitive synthetic detail');
                    }
                    return false;
                  },
                ),
              ),
              child: const Text('Open'),
            ),
          ),
          locale: Locale(language),
        );
        await tester.tap(find.text('Open'));
        await tester.pump();
        expect(
          find.text(
            language == 'en'
                ? 'Could not open this link. Please try again.'
                : 'Không thể mở liên kết này. Vui lòng thử lại.',
          ),
          findsOneWidget,
        );
        expect(find.textContaining('synthetic detail'), findsNothing);
        expect(find.textContaining('example.test'), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('successful launch has no error notification', (tester) async {
    await _pumpFeedback(
      tester,
      Builder(
        builder: (context) => TextButton(
          onPressed: () => unawaited(
            openMobileLink(
              context,
              Uri.parse('https://example.test'),
              readPreference: () async => LinkBrowserPreference.builtIn,
              launch: (_, _) async => true,
            ),
          ),
          child: const Text('Open'),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pump();
    expect(find.byType(SnackBar), findsNothing);
  });

  testWidgets('failed deferred launch after unmount does not use old context', (
    tester,
  ) async {
    final result = Completer<bool>();
    await _pumpFeedback(
      tester,
      Builder(
        builder: (context) => TextButton(
          onPressed: () => unawaited(
            openMobileLink(
              context,
              Uri.parse('https://example.test'),
              readPreference: () async => LinkBrowserPreference.builtIn,
              launch: (_, _) => result.future,
            ),
          ),
          child: const Text('Open'),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    result.complete(false);
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}

Future<void> _pumpFeedback(
  WidgetTester tester,
  Widget child, {
  Locale? locale,
}) => tester.pumpWidget(
  MaterialApp(
    locale: locale,
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: child),
  ),
);
