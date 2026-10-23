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

  testWidgets('frame keeps the body mounted when the rail comes and goes', (
    tester,
  ) async {
    final rail = ValueNotifier<bool>(false);
    addTearDown(rail.dispose);
    await tester.pumpApp(
      ValueListenableBuilder<bool>(
        valueListenable: rail,
        builder: (context, showRail, _) => AdaptiveShellFrame(
          rail: showRail
              ? ShellNavigationRail(
                  items: _items(),
                  selectedKey: _home,
                  onSelected: (_) {},
                )
              : null,
          body: const _Counter(key: ValueKey('body')),
        ),
      ),
    );
    final body = tester.state(find.byType(_Counter));
    expect(find.byType(ShellNavigationRail), findsNothing);
    expect(tester.getRect(find.byKey(const ValueKey('body'))).left, 0);

    for (final showRail in [true, false, true]) {
      rail.value = showRail;
      await tester.pump();
      expect(tester.state(find.byType(_Counter)), same(body));
      expect(
        find.byType(ShellNavigationRail),
        showRail ? findsOneWidget : findsNothing,
      );
    }
    expect(_Counter.mounts, 1);
  });
}

class _Counter extends StatefulWidget {
  const _Counter({super.key});

  static int mounts = 0;

  @override
  State<_Counter> createState() => _CounterState();
}

class _CounterState extends State<_Counter> {
  @override
  void initState() {
    super.initState();
    _Counter.mounts++;
  }

  @override
  Widget build(BuildContext context) => const SizedBox.expand();
}
