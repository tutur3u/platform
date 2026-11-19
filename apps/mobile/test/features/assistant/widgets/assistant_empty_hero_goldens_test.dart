@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/features/assistant/widgets/assistant_empty_hero.dart';

import '../../../helpers/golden_tolerance.dart';
import '../../../helpers/pump_app.dart';

void main() {
  final original = goldenFileComparator;
  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File(
        'test/features/assistant/widgets/assistant_empty_hero_goldens_test.dart',
      ).absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet', const SorbetTheme()),
  ]) {
    for (final brightness in Brightness.values) {
      final name = 'mira_empty_${design}_${brightness.name}';
      testWidgets(name, (tester) async {
        tester.view
          ..physicalSize = const Size(390, 480)
          ..devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          sorbetTestApp(
            sorbet: sorbet,
            brightness: brightness,
            boundaryKey: const ValueKey('golden'),
            home: Builder(
              builder: (context) => ColoredBox(
                color: Theme.of(context).scaffoldBackgroundColor,
                child: const AssistantEmptyHero(assistantName: 'Mira'),
              ),
            ),
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
