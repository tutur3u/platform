import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/view/mastermind_scroll_clearance.dart';
import 'package:mobile/features/mastermind/view/mastermind_sources_sheet.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('last source row clears the shell dock across the modal route', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 800);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    const shellClearance = 180.0;
    await tester.pumpApp(
      MastermindScrollClearance(
        bottom: shellClearance,
        child: AppPageScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Builder(
                builder: (context) => TextButton(
                  onPressed: () => showMastermindSourcesSheet(
                    context,
                    sources: [
                      for (final source in SourceName.values)
                        Source(source: source, state: SourceState.ok),
                    ],
                  ),
                  child: const Text('Sources'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
    await tester.tap(find.text('Sources'));
    await tester.pumpAndSettle();
    final last = find.text(AppLocalizationsEn().mastermindSourceCi);
    await tester.scrollUntilVisible(
      last,
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.drag(
      find.byType(CustomScrollView).last,
      const Offset(0, -2000),
    );
    await tester.pumpAndSettle();
    expect(
      tester.getRect(last).bottom,
      lessThanOrEqualTo(800 - shellClearance),
    );
    expect(last.hitTestable(), findsOneWidget);
  });
}
