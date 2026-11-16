@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';

import '../../helpers/golden_tolerance.dart';
import '../../helpers/pump_app.dart';
import 'design_sheets.dart';

const List<(String, SorbetTheme?)> _designs = [
  ('classic', null),
  ('sorbet', SorbetTheme()),
];

Future<void> _pumpSheet(
  WidgetTester tester, {
  required Size size,
  required SorbetTheme? sorbet,
  required Brightness brightness,
  required Widget sheet,
}) async {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    sorbetTestApp(
      sorbet: sorbet,
      brightness: brightness,
      boundaryKey: const ValueKey('golden'),
      home: sheet,
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  final original = goldenFileComparator;
  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File('test/core/ui/design_goldens_test.dart').absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (design, sorbet) in _designs) {
    for (final brightness in Brightness.values) {
      for (final (device, size) in [
        ('phone', const Size(390, 844)),
        ('tablet', const Size(834, 1194)),
      ]) {
        final name = 'components_${design}_${brightness.name}_$device';
        testWidgets(name, (tester) async {
          await _pumpSheet(
            tester,
            size: size,
            sorbet: sorbet,
            brightness: brightness,
            sheet: const ComponentSheet(),
          );
          await expectLater(
            find.byKey(const ValueKey('golden')),
            matchesGoldenFile('goldens/$name.png'),
          );
          expect(tester.takeException(), isNull);
        });
      }

      final name = 'typography_${design}_${brightness.name}_phone';
      testWidgets(name, (tester) async {
        await _pumpSheet(
          tester,
          size: const Size(390, 844),
          sorbet: sorbet,
          brightness: brightness,
          sheet: const TypographySheet(),
        );
        await expectLater(
          find.byKey(const ValueKey('golden')),
          matchesGoldenFile('goldens/$name.png'),
        );
        expect(tester.takeException(), isNull);
      });
    }
  }
}
