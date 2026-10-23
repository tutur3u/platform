import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';

import 'shell_rail_harness.dart';

const _portrait = Size(820, 1180);
const _landscape = Size(1180, 820);

final Finder _routedProbe = find.byWidgetPredicate(
  (widget) => widget is MountProbe && widget.label == Routes.inventorySales,
);

/// Visits the Assistant root tab (kept mounted offstage by the shell), then
/// opens a mini-app route, so tests can check both survive layout changes.
Future<RailShell> _pumpWithVisitedRootTab(
  WidgetTester tester,
  List<String> mounts,
) async {
  final shell = await pumpRailShell(
    tester,
    Routes.assistant,
    assistantPage: (_) => MountProbe(label: 'assistant', mounts: mounts),
    page: (route) => MountProbe(label: route, mounts: mounts),
  );
  shell.router.go(Routes.inventorySales);
  await settleShell(tester);
  return shell;
}

void main() {
  setUp(mockShellBackChannel);

  testWidgets('rotating across the rail breakpoint keeps root tab state', (
    tester,
  ) async {
    useShellWindow(tester, _portrait);
    final mounts = <String>[];
    await pumpRailShell(
      tester,
      Routes.assistant,
      assistantPage: (_) => MountProbe(label: 'assistant', mounts: mounts),
    );
    expect(find.byType(ShellNavigationRail), findsNothing);
    final probe = tester.state(find.byType(MountProbe));
    final dock = tester.state(find.byType(FloatingShellDock));

    for (final size in [_landscape, _portrait, _landscape]) {
      await resizeShellWindow(tester, size);
      final rail = shellNavigationModeFor(size) == ShellNavigationMode.rail;
      expect(find.byType(ShellNavigationRail), rail ? findsOne : findsNothing);
      expect(tester.state(find.byType(MountProbe)), same(probe));
      expect(tester.state(find.byType(FloatingShellDock)), same(dock));
    }
    expect(mounts, ['assistant']);
    expect(tester.takeException(), isNull);
  });

  testWidgets('resizing a desktop window keeps root tab and page state', (
    tester,
  ) async {
    useShellWindow(tester, const Size(900, 700));
    final mounts = <String>[];
    final shell = await _pumpWithVisitedRootTab(tester, mounts);
    expect(find.byType(ShellNavigationRail), findsOneWidget);
    final probe = tester.state(_routedProbe);
    final dock = tester.state(find.byType(FloatingShellDock));
    // Width below 840, then shortest side below 600, then back to the rail.
    for (final size in [
      const Size(800, 700),
      const Size(1000, 560),
      const Size(1000, 700),
    ]) {
      await resizeShellWindow(tester, size);
      expect(tester.state(_routedProbe), same(probe));
      expect(tester.state(find.byType(FloatingShellDock)), same(dock));
    }
    expect(find.byType(ShellNavigationRail), findsOneWidget);
    // The offstage Assistant root tab survives too, not just the routed page.
    expect(mounts, ['assistant', Routes.inventorySales]);
    expect(shell.path, Routes.inventorySales);
  });

  testWidgets('immersive toggles in rail mode keep root tab and page state', (
    tester,
  ) async {
    useShellWindow(tester, _landscape);
    final mounts = <String>[];
    final shell = await _pumpWithVisitedRootTab(tester, mounts);
    final probe = tester.state(_routedProbe);

    shell.actions.register(
      registrationId: 'immersive-video',
      ownerId: 'immersive-video',
      locations: const {Routes.inventorySales},
      actions: const [],
      immersive: true,
    );
    await settleShell(tester);
    expect(find.byType(ShellNavigationRail), findsNothing);
    expect(tester.state(_routedProbe), same(probe));

    shell.actions.unregister('immersive-video');
    await settleShell(tester);
    expect(find.byType(ShellNavigationRail), findsOneWidget);
    expect(tester.state(_routedProbe), same(probe));
    expect(mounts, ['assistant', Routes.inventorySales]);
  });

  testWidgets('rail-mode pages reserve dock clearance only for dock content', (
    tester,
  ) async {
    useShellWindow(tester, _landscape);
    final bottoms = <double>[];
    final shell = await pumpRailShell(
      tester,
      Routes.inventorySales,
      page: (route) => Builder(
        builder: (context) {
          bottoms.add(MediaQuery.paddingOf(context).bottom);
          return const SizedBox.expand();
        },
      ),
    );
    expect(bottoms.last, 0);

    shell.actions.register(
      registrationId: 'sales-create',
      ownerId: 'sales-create',
      locations: const {Routes.inventorySales},
      actions: [
        ShellActionSpec(
          id: 'sales-create',
          icon: Icons.add,
          tooltip: 'Create',
          inDock: true,
          onPressed: () {},
        ),
      ],
    );
    await settleShell(tester);
    expect(bottoms.last, greaterThan(0));

    shell.actions.unregister('sales-create');
    await settleShell(tester);
    shell.router.go(Routes.inventory);
    await settleShell(tester);
    expect(bottoms.last, 0);
  });

  testWidgets('phones keep dock clearance with or without dock actions', (
    tester,
  ) async {
    useShellWindow(tester, const Size(390, 844));
    final bottoms = <double>[];
    await pumpRailShell(
      tester,
      Routes.inventorySales,
      page: (route) => Builder(
        builder: (context) {
          bottoms.add(MediaQuery.paddingOf(context).bottom);
          return const SizedBox.expand();
        },
      ),
    );
    expect(find.byType(MorphingNavigationBar), findsOneWidget);
    expect(bottoms.last, greaterThan(0));
  });

  testWidgets('right-to-left shells put the rail on the leading edge', (
    tester,
  ) async {
    useShellWindow(tester, _landscape);
    final shell = await pumpRailShell(
      tester,
      Routes.apps,
      textDirection: TextDirection.rtl,
    );
    shell.router.go(Routes.inventorySales);
    await settleShell(tester);
    final l10n = shellL10n(tester);
    final rail = tester.getRect(
      find.byKey(const ValueKey('shell-navigation-rail')),
    );
    expect(rail.right, closeTo(_landscape.width - 12, 0.5));
    final page = tester.getRect(find.text(Routes.inventorySales));
    expect(page.right, lessThan(rail.left));

    await tester.tap(railItem(l10n.navBack));
    await settleShell(tester);
    expect(shell.path, Routes.apps);
    expect(tester.takeException(), isNull);
  });

  testWidgets('rail labels appear on pointer hover only', (tester) async {
    useShellWindow(tester, _landscape);
    final shell = await pumpRailShell(tester, Routes.apps);
    shell.router.go(Routes.inventorySales);
    await settleShell(tester);
    final l10n = shellL10n(tester);
    final back = railItem(l10n.navBack);
    final tooltip = find.descendant(
      of: find.byType(ShellNavigationRail),
      matching: find.byWidgetPredicate(
        (widget) => widget is Tooltip && widget.message == l10n.navBack,
      ),
    );
    expect(tooltip, findsOneWidget);
    expect(
      tester.widget<Tooltip>(tooltip).triggerMode,
      TooltipTriggerMode.manual,
    );

    final touch = await tester.startGesture(tester.getCenter(back));
    await tester.pump(const Duration(seconds: 1));
    await touch.cancel();
    await tester.pump();
    expect(find.text(l10n.navBack), findsNothing);

    final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
    addTearDown(mouse.removePointer);
    await mouse.addPointer(location: Offset.zero);
    await mouse.moveTo(tester.getCenter(back));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text(l10n.navBack), findsOneWidget);
    await mouse.moveTo(Offset.zero);
    await tester.pump(const Duration(seconds: 2));
    await settleShell(tester);
  });
}
