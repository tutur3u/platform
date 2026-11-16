@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/ui.dart';

import '../../../helpers/golden_tolerance.dart';
import '../../../helpers/pump_app.dart';

/// A settings-like screen: grouped rows, a card, primary and outline
/// buttons, a text field and a status chip.
class _Composition extends StatelessWidget {
  const _Composition();

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final sorbet = SorbetTokens.maybeOf(context);
    final colors = tokens.colorScheme;
    final chipFill =
        sorbet?.hues.green.fill ?? colors.success.withValues(alpha: 0.14);
    final chipInk = sorbet?.hues.green.ink ?? colors.success;
    return ColoredBox(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              AppGroupedSection(
                caption: 'Account',
                children: [
                  AppGroupedRow(
                    title: const Text('Notifications'),
                    trailing: AppSwitch(value: true, onChanged: (_) {}),
                  ),
                  const AppGroupedRow(
                    title: Text('Language'),
                    subtitle: Text('English'),
                  ),
                ],
              ),
              const AppGap(16),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Weekly plan', style: tokens.typography.h4),
                    const AppGap(8),
                    DecoratedBox(
                      decoration: ShapeDecoration(
                        color: chipFill,
                        shape: const StadiumBorder(),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        child: Text(
                          'On track',
                          style: tokens.typography.label.copyWith(
                            color: chipInk,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const AppGap(16),
              const AppTextField(placeholder: 'Search'),
              const AppGap(16),
              Row(
                children: [
                  AppButton.primary(
                    onPressed: () {},
                    child: const Text('Save'),
                  ),
                  const AppGap(12),
                  AppButton.outline(
                    onPressed: () {},
                    child: const Text('Cancel'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void main() {
  final original = goldenFileComparator;
  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File('test/core/theme/sorbet/sorbet_goldens_test.dart').absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet', const SorbetTheme()),
  ]) {
    for (final brightness in Brightness.values) {
      for (final (device, size) in [
        ('phone', const Size(390, 844)),
        ('tablet', const Size(834, 1194)),
      ]) {
        final name = '${design}_${brightness.name}_$device';
        testWidgets(name, (tester) async {
          tester.view
            ..physicalSize = size
            ..devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          await tester.pumpWidget(
            sorbetTestApp(
              sorbet: sorbet,
              brightness: brightness,
              boundaryKey: const ValueKey('golden'),
              home: const _Composition(),
            ),
          );
          await tester.pumpAndSettle();
          await expectLater(
            find.byKey(const ValueKey('golden')),
            matchesGoldenFile('goldens/$name.png'),
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
