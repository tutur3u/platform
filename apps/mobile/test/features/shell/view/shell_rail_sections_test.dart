import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/shell_dock_nav_icon.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';
import 'package:mobile/features/shell/view/shell_rail_sections.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/pump_app.dart';

void main() {
  Future<List<Key?>> pumpRail(WidgetTester tester, {required bool extended}) {
    final taps = <Key?>[];
    tester.view
      ..physicalSize = const Size(1440, 900)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    return tester
        .pumpApp(
          Align(
            alignment: Alignment.centerLeft,
            child: SizedBox(
              width: extended ? 260 : 72,
              child: ShellNavigationRail(
                extended: extended,
                selectedKey: const ValueKey('inbox'),
                onSelected: taps.add,
                items: const [
                  shad.NavigationItem(
                    key: ValueKey('section'),
                    child: ShellDockNavIcon(
                      icon: Icons.folder_outlined,
                      label: 'Labels',
                      heading: true,
                      expanded: false,
                      count: 2,
                    ),
                  ),
                  shad.NavigationItem(
                    key: ValueKey('inbox'),
                    child: ShellDockNavIcon(
                      icon: Icons.inbox_outlined,
                      label: 'Inbox',
                      count: 4,
                    ),
                  ),
                  shad.NavigationItem(
                    key: ValueKey('label'),
                    child: ShellDockNavIcon(
                      icon: Icons.label_outline,
                      label: 'Finance',
                      dotColor: Color(0xFF22C55E),
                    ),
                  ),
                ],
              ),
            ),
          ),
        )
        .then((_) => taps);
  }

  testWidgets('the sidebar shows section headings, counts and label dots', (
    tester,
  ) async {
    final taps = await pumpRail(tester, extended: true);
    await tester.pumpAndSettle();

    final heading = find.byType(ShellRailSectionHeading);
    expect(heading, findsOneWidget);
    expect(find.text('Labels'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(
      tester.getSemantics(heading),
      isSemantics(label: 'Labels', isButton: true, hasExpandedState: true),
    );
    expect(find.byType(ShellRailCount), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is DecoratedBox &&
            widget.decoration is BoxDecoration &&
            (widget.decoration as BoxDecoration).color ==
                const Color(0xFF22C55E),
      ),
      findsOneWidget,
    );

    await tester.tap(heading);
    expect(taps, [const ValueKey('section')]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the icon rail keeps headings as compact toggles', (
    tester,
  ) async {
    final taps = await pumpRail(tester, extended: false);
    await tester.pumpAndSettle();

    expect(find.text('Labels'), findsNothing);
    expect(find.byType(ShellRailCount), findsNothing);
    await tester.tap(find.byType(ShellRailSectionHeading));
    expect(taps, [const ValueKey('section')]);
    expect(tester.takeException(), isNull);
  });
}
