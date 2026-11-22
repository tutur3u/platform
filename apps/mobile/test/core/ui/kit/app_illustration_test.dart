import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';

import '../../../helpers/pump_app.dart';

/// [sorbetTestApp] turns animations off; this host restores them unless
/// [reduceMotion] is set.
Widget _host(Widget child, {bool reduceMotion = false}) => sorbetTestApp(
  home: Builder(
    builder: (context) => MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
      child: Scaffold(body: child),
    ),
  ),
);

void main() {
  testWidgets('loops a few passes and then rests', (tester) async {
    await tester.pumpWidget(
      _host(const AppIllustration(AppIllustrationKind.noTasks, cycles: 2)),
    );
    expect(tester.binding.hasScheduledFrame, isTrue);
    for (var i = 0; i < 8; i++) {
      await tester.pump(AppIllustration.period ~/ 4);
    }
    expect(tester.binding.hasScheduledFrame, isTrue);
    for (var i = 0; i < 8; i++) {
      await tester.pump(AppIllustration.period ~/ 4);
    }
    expect(tester.binding.hasScheduledFrame, isFalse);
  });

  testWidgets('stays still under reduced motion', (tester) async {
    await tester.pumpWidget(
      _host(
        const AppIllustration(AppIllustrationKind.offline),
        reduceMotion: true,
      ),
    );
    await tester.pump();
    expect(tester.binding.hasScheduledFrame, isFalse);
  });

  testWidgets('every scene paints without errors', (tester) async {
    await tester.pumpWidget(
      _host(
        Wrap(
          children: [
            for (final kind in AppIllustrationKind.values)
              AppIllustration(kind, size: 60),
          ],
        ),
      ),
    );
    await tester.pump(AppIllustration.period ~/ 3);
    expect(tester.takeException(), isNull);
    expect(
      find.byType(AppIllustration),
      findsNWidgets(AppIllustrationKind.values.length),
    );
  });

  group('sign-in scenes', () {
    const scenes = [
      AppIllustrationKind.welcomeBowl,
      AppIllustrationKind.emailCode,
      AppIllustrationKind.twoStep,
      AppIllustrationKind.passkey,
      AppIllustrationKind.accounts,
      AppIllustrationKind.locked,
    ];

    test('are flagged as auth scenes', () {
      for (final kind in AppIllustrationKind.values) {
        expect(kind.isAuthScene, scenes.contains(kind), reason: kind.name);
      }
    });

    for (final brightness in Brightness.values) {
      testWidgets('paint in ${brightness.name} on Sorbet and Classic', (
        tester,
      ) async {
        for (final sorbet in [const SorbetTheme(), null]) {
          await tester.pumpWidget(
            sorbetTestApp(
              sorbet: sorbet,
              brightness: brightness,
              home: Scaffold(
                body: Wrap(
                  children: [
                    for (final kind in scenes) AppIllustration(kind, size: 90),
                  ],
                ),
              ),
            ),
          );
          for (var i = 0; i < 4; i++) {
            await tester.pump(AppIllustration.period ~/ 4);
          }
          expect(tester.takeException(), isNull);
        }
      });
    }

    testWidgets('keep their view box ratio', (tester) async {
      await tester.pumpWidget(
        _host(
          const Column(
            children: [
              AppIllustration(AppIllustrationKind.welcomeBowl, size: 320),
              AppIllustration(AppIllustrationKind.twoStep, size: 200),
            ],
          ),
        ),
      );
      final sizes = tester
          .widgetList<AppIllustration>(find.byType(AppIllustration))
          .map((w) => tester.getSize(find.byWidget(w)))
          .toList();
      expect(sizes[0], const Size(320, 280));
      expect(sizes[1], const Size(200, 160));
    });

    testWidgets('stay still under reduced motion', (tester) async {
      await tester.pumpWidget(
        _host(
          const AppIllustration(AppIllustrationKind.welcomeBowl),
          reduceMotion: true,
        ),
      );
      await tester.pump();
      expect(tester.binding.hasScheduledFrame, isFalse);
    });

    test('Classic hues tint the status roles', () {
      final hues = AppIllustrationPalette.classicHues(AppColorTokens.light);
      expect(hues.green.ink, AppColorTokens.light.success);
      expect(hues.blue.ink, AppColorTokens.light.info);
      expect(hues.red.calm.a, lessThan(hues.red.fill.a));
    });
  });

  testWidgets('state message swaps its icon tile for an illustration', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        const AppStateMessage(
          icon: Icons.inbox_outlined,
          title: 'Nothing here',
          illustration: AppIllustration(
            AppIllustrationKind.notificationsClear,
            cycles: 0,
          ),
        ),
      ),
    );
    expect(find.byType(AppIllustration), findsOneWidget);
    expect(find.byType(AppIconTile), findsNothing);
    expect(find.text('Nothing here'), findsOneWidget);
  });

  testWidgets('state message keeps its icon tile by default', (tester) async {
    await tester.pumpWidget(
      _host(const AppStateMessage(icon: Icons.inbox_outlined, title: 'Empty')),
    );
    expect(find.byType(AppIconTile), findsOneWidget);
    expect(find.byType(AppIllustration), findsNothing);
  });
}
