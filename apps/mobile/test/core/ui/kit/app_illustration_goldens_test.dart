@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/kit/kit.dart';

import '../../../helpers/golden_tolerance.dart';
import '../../../helpers/pump_app.dart';

/// Every illustration scene at rest, in three tones.
class _Board extends StatelessWidget {
  const _Board();

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Theme.of(context).scaffoldBackgroundColor,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          // Sign-in scenes are covered by app_illustration_test.dart; adding
          // them here would need new Linux baselines for this board.
          for (final kind in AppIllustrationKind.values)
            if (!kind.isAuthScene) AppIllustration(kind, size: 108, cycles: 0),
          const AppIllustration(
            AppIllustrationKind.offline,
            size: 108,
            tone: AppTone.destructive,
            cycles: 0,
          ),
          const AppIllustration(
            AppIllustrationKind.noTasks,
            size: 108,
            tone: AppTone.neutral,
            cycles: 0,
          ),
          const AppIllustration(
            AppIllustrationKind.wallet,
            size: 108,
            tone: AppTone.success,
            cycles: 0,
          ),
        ],
      ),
    ),
  );
}

void main() {
  final original = goldenFileComparator;
  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File('test/core/ui/kit/app_illustration_goldens_test.dart').absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet', const SorbetTheme()),
  ]) {
    for (final brightness in Brightness.values) {
      final name = 'illustrations_${design}_${brightness.name}';
      testWidgets(name, (tester) async {
        tester.view
          ..physicalSize = const Size(390, 520)
          ..devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          sorbetTestApp(
            sorbet: sorbet,
            brightness: brightness,
            boundaryKey: const ValueKey('golden'),
            home: const _Board(),
          ),
        );
        await tester.pump();
        await expectLater(
          find.byKey(const ValueKey('golden')),
          matchesGoldenFile('goldens/$name.png'),
        );
        expect(tester.takeException(), isNull);
      });
    }
  }
}
