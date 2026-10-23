import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

const _back = ValueKey<String>('back');
const _home = ValueKey<String>('home');
const _tasks = ValueKey<String>('tasks');

List<shad.NavigationItem> _items() => [
  shad.NavigationItem(
    key: _back,
    child: Semantics(
      label: 'Back',
      button: true,
      child: const ExcludeSemantics(child: Icon(Icons.chevron_left)),
    ),
  ),
  shad.NavigationItem(
    key: _home,
    child: Semantics(
      label: 'Home',
      button: true,
      child: const ExcludeSemantics(child: Icon(Icons.home_outlined)),
    ),
  ),
  shad.NavigationItem(
    key: _tasks,
    enabled: false,
    child: Semantics(
      label: 'Tasks',
      button: true,
      child: const ExcludeSemantics(child: Icon(Icons.check)),
    ),
  ),
];

Future<List<Key?>> _pumpRail(
  WidgetTester tester, {
  TextDirection direction = TextDirection.ltr,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(1200, 800);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final selected = <Key?>[];
  await tester.pumpApp(
    Directionality(
      textDirection: direction,
      child: AdaptiveShellFrame(
        rail: ShellNavigationRail(
          items: _items(),
          selectedKey: _home,
          onSelected: selected.add,
        ),
        body: const SizedBox.expand(key: ValueKey('body')),
      ),
    ),
  );
  return selected;
}

void main() {
  testWidgets('rail keeps Back reachable and reports selection', (
    tester,
  ) async {
    final selected = await _pumpRail(tester);
    final rail = tester.getRect(
      find.byKey(const ValueKey('shell-navigation-rail')),
    );
    final body = tester.getRect(find.byKey(const ValueKey('body')));
    expect(rail.left, closeTo(12, 0.5));
    expect(body.left, closeTo(shellNavigationRailExtent, 0.5));
    expect(body.right, 1200);

    final back = tester.getSize(find.byKey(_back));
    expect(back.width, greaterThanOrEqualTo(48));
    expect(back.height, greaterThanOrEqualTo(48));

    await tester.tap(find.byKey(_back));
    await tester.tap(find.byKey(_tasks));
    expect(selected, [_back]);

    final homeSemantics = tester.getSemantics(find.bySemanticsLabel('Home'));
    expect(homeSemantics.flagsCollection.isSelected, ui.Tristate.isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('rail sits on the leading edge in right-to-left layouts', (
    tester,
  ) async {
    await _pumpRail(tester, direction: TextDirection.rtl);
    final rail = tester.getRect(
      find.byKey(const ValueKey('shell-navigation-rail')),
    );
    final body = tester.getRect(find.byKey(const ValueKey('body')));
    expect(rail.right, closeTo(1200 - 12, 0.5));
    expect(body.left, 0);
    expect(body.right, closeTo(1200 - shellNavigationRailExtent, 0.5));
  });

  testWidgets('frame returns the body unchanged without a rail', (
    tester,
  ) async {
    await tester.pumpApp(
      const AdaptiveShellFrame(body: SizedBox.expand(key: ValueKey('body'))),
    );
    expect(find.byType(ShellNavigationRail), findsNothing);
    expect(find.byType(Stack), findsNothing);
  });
}
