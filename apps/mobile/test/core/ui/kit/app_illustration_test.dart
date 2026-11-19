import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';

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
    expect(find.byType(AppIllustration), findsNWidgets(9));
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
