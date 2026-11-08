import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/view/mastermind_sources_sheet.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

import '../../../helpers/helpers.dart';

const _dockKey = Key('dock');

/// A stand-in for the shell: pages live in a nested navigator and the
/// floating dock is painted over them, as in `ShellPage`.
class _FakeShell extends StatelessWidget {
  const _FakeShell({required this.page});

  final Widget page;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Navigator(
        onGenerateRoute: (_) => MaterialPageRoute<void>(builder: (_) => page),
      ),
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        height: 180,
        child: GestureDetector(
          key: _dockKey,
          behavior: HitTestBehavior.opaque,
          onTap: () {},
          child: const ColoredBox(color: Colors.transparent),
        ),
      ),
    ],
  );
}

void main() {
  testWidgets('the Sources sheet opens above the dock, all rows reachable', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 800);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpApp(
      _FakeShell(
        page: Builder(
          builder: (context) => Center(
            child: TextButton(
              onPressed: () => showMastermindSourcesSheet(
                context,
                sources: [
                  for (final source in SourceName.values)
                    Source(source: source, state: SourceState.ok),
                ],
              ),
              child: const Text('Open sources'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open sources'));
    await tester.pumpAndSettle();

    // The sheet's route is not on the nested page navigator.
    final sheetTitle = find.text('Sources');
    expect(sheetTitle, findsOneWidget);
    final nested = find.ancestor(
      of: find.text('Open sources'),
      matching: find.byType(Navigator),
    );
    expect(
      find.descendant(of: nested.first, matching: sheetTitle),
      findsNothing,
    );

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
    // Within the dock's band, yet hit-testable: the sheet is painted above
    // the dock, so the dock can neither cover nor swallow the last row.
    expect(tester.getRect(last).bottom, greaterThan(800 - 180));
    expect(last.hitTestable(), findsOneWidget);
  });
}
