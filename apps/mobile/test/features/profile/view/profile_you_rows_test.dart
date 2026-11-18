import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/profile/view/profile_you_rows.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  late GoRouter router;
  var timelineOpened = 0;

  setUp(() {
    timelineOpened = 0;
    router = GoRouter(
      initialLocation: Routes.profileRoot,
      routes: [
        GoRoute(
          path: Routes.profileRoot,
          builder: (_, _) => Scaffold(
            body: ListView(
              children: [
                ProfileYouRows(onOpenTimeline: () => timelineOpened++),
              ],
            ),
          ),
        ),
        GoRoute(
          path: Routes.settings,
          builder: (_, _) => const Text('Settings page'),
        ),
      ],
    );
  });

  tearDown(() => router.dispose());

  Future<void> pump(WidgetTester tester, {double scale = 1}) async {
    tester.platformDispatcher.textScaleFactorTestValue = scale;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpWidget(
      MaterialApp.router(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('rows open Timeline and Settings', (tester) async {
    await pump(tester);

    expect(find.text('Workspaces'), findsNothing);
    for (final key in ['timeline', 'settings']) {
      expect(
        tester.getSize(find.byKey(ValueKey('you-row-$key'))).height,
        greaterThanOrEqualTo(48),
        reason: key,
      );
    }

    await tester.tap(find.byKey(const ValueKey('you-row-timeline')));
    expect(timelineOpened, 1);

    await tester.tap(find.byKey(const ValueKey('you-row-settings')));
    await tester.pumpAndSettle();
    expect(find.text('Settings page'), findsOneWidget);
  });

  testWidgets('rows fit 320dp at 2x text', (tester) async {
    tester.view
      ..physicalSize = const Size(320, 568)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pump(tester, scale: 2);
    expect(tester.takeException(), isNull);
    expect(find.byKey(const ValueKey('you-row-settings')), findsOneWidget);
  });
}
