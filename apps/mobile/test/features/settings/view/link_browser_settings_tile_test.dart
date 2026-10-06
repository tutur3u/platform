import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/features/settings/view/link_browser_settings_tile.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets('real chooser saves and restores the default-browser selection', (
    tester,
  ) async {
    await tester.pumpApp(const LinkBrowserSettingsTile());
    await tester.pumpAndSettle();
    expect(find.text('Built-in browser'), findsOneWidget);
    await tester.tap(find.text('Open links in'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Default browser'));
    await tester.pumpAndSettle();
    expect(await readLinkBrowserPreference(), LinkBrowserPreference.external);
    expect(find.text('Default browser'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpApp(const LinkBrowserSettingsTile());
    await tester.pumpAndSettle();
    expect(find.text('Default browser'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed load is visible and tap retries without overwriting it', (
    tester,
  ) async {
    var attempts = 0;
    await tester.pumpApp(
      LinkBrowserSettingsTile(
        readPreference: () async {
          if (++attempts == 1) throw StateError('Synthetic preference failure');
          return LinkBrowserPreference.external;
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Could not load or save browser preference. Tap to retry.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Open links in'));
    await tester.pumpAndSettle();
    expect(find.text('Default browser'), findsOneWidget);
    expect(attempts, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'failed save remains visible and does not change selected preference',
    (tester) async {
      await tester.pumpApp(
        LinkBrowserSettingsTile(
          savePreference: (_) async {
            throw StateError('Synthetic save failure');
          },
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open links in'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Default browser'));
      await tester.pumpAndSettle();
      expect(
        find.text('Could not load or save browser preference. Tap to retry.'),
        findsOneWidget,
      );
      expect(await readLinkBrowserPreference(), LinkBrowserPreference.builtIn);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('late initial read cannot replace a newly saved choice', (
    tester,
  ) async {
    final initial = Completer<LinkBrowserPreference>();
    var reads = 0;
    await tester.pumpApp(
      LinkBrowserSettingsTile(
        readPreference: () {
          if (++reads == 1) return initial.future;
          return readLinkBrowserPreference();
        },
      ),
    );
    await tester.pump();
    await tester.tap(find.text('Open links in'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open links in'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Default browser'));
    await tester.pumpAndSettle();
    expect(await readLinkBrowserPreference(), LinkBrowserPreference.external);
    initial.complete(LinkBrowserPreference.builtIn);
    await tester.pumpAndSettle();
    expect(find.text('Default browser'), findsOneWidget);
    expect(find.text('Built-in browser'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
