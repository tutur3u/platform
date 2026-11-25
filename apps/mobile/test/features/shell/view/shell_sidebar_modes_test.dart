import 'dart:ui' show PointerDeviceKind;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/settings/view/appearance/appearance_sidebar_section.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';

import 'shell_rail_harness.dart';

const _desktop = Size(1400, 800);
const ValueKey<String> _body = ValueKey('sidebar-mode-test-body');
const ValueKey<String> _overlay = ValueKey('shell-sidebar-overlay');
const ValueKey<String> _logo = ValueKey('shell-sidebar-logo');

Widget _page(String route) => const SizedBox.expand(key: _body);

Rect _bodyRect(WidgetTester tester) => tester.getRect(find.byKey(_body));

Future<void> _shortcut(
  WidgetTester tester, {
  bool alt = false,
  bool command = false,
}) async {
  final modifier = command
      ? LogicalKeyboardKey.metaLeft
      : LogicalKeyboardKey.controlLeft;
  await tester.sendKeyDownEvent(modifier);
  if (alt) await tester.sendKeyDownEvent(LogicalKeyboardKey.altLeft);
  await tester.sendKeyEvent(LogicalKeyboardKey.keyB);
  if (alt) await tester.sendKeyUpEvent(LogicalKeyboardKey.altLeft);
  await tester.sendKeyUpEvent(modifier);
  await settleShell(tester);
}

void main() {
  setUp(mockShellBackChannel);

  const extents = {
    SidebarBehavior.expanded: shellNavigationSidebarExtent,
    SidebarBehavior.collapsed: shellNavigationRailExtent,
    SidebarBehavior.hover: shellNavigationRailExtent,
    SidebarBehavior.minimal: shellSidebarMinimalExtent,
  };
  for (final mode in SidebarBehavior.values) {
    testWidgets('${mode.name} reserves its resting width', (tester) async {
      useShellWindow(tester, _desktop);
      await pumpRailShell(
        tester,
        Routes.inventorySales,
        sidebarBehavior: mode.name,
        page: _page,
      );

      expect(_bodyRect(tester).left, extents[mode]);
      expect(find.byKey(_overlay), findsNothing);
      expect(
        find.byKey(_logo),
        mode == SidebarBehavior.minimal ? findsOneWidget : findsNothing,
      );
    });
  }

  for (final mode in [SidebarBehavior.hover, SidebarBehavior.minimal]) {
    testWidgets('${mode.name} hover overlay does not reflow the page', (
      tester,
    ) async {
      useShellWindow(tester, _desktop);
      await pumpRailShell(
        tester,
        Routes.inventorySales,
        sidebarBehavior: mode.name,
        page: _page,
      );
      final body = _bodyRect(tester);
      final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await mouse.addPointer(location: const Offset(400, 200));
      addTearDown(mouse.removePointer);
      await mouse.moveTo(const Offset(28, 36));
      await settleShell(tester);

      final overlay = find.byKey(_overlay);
      expect(tester.getSize(overlay).width, shellNavigationSidebarExtent);
      expect(_bodyRect(tester), body);
      await mouse.moveTo(const Offset(190, 200));
      await settleShell(tester);
      expect(overlay, findsOneWidget);

      await mouse.moveTo(const Offset(400, 200));
      await tester.pump(const Duration(milliseconds: 50));
      expect(overlay, findsOneWidget);
      await settleShell(tester);
      expect(overlay, findsNothing);
      expect(_bodyRect(tester), body);
    });
  }

  testWidgets('minimal opens by tap and closes with Escape or navigation', (
    tester,
  ) async {
    useShellWindow(tester, _desktop);
    final shell = await pumpRailShell(
      tester,
      Routes.inventorySales,
      sidebarBehavior: 'minimal',
      page: _page,
    );
    final body = _bodyRect(tester);
    final logo = find.byTooltip(shellL10n(tester).appearanceSidebarOpen);
    await tester.tap(logo);
    await settleShell(tester);
    expect(find.byKey(_overlay), findsOneWidget);
    expect(_bodyRect(tester), body);
    expect(
      find.descendant(
        of: find.byKey(_overlay),
        matching: find.byType(ShellSidebarAccount),
      ),
      findsOneWidget,
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await settleShell(tester);
    expect(find.byKey(_overlay), findsNothing);

    await tester.tap(logo);
    await settleShell(tester);
    final products = find.descendant(
      of: find.byKey(_overlay),
      matching: find.text(shellL10n(tester).inventoryProductsLabel),
    );
    await tester.tap(products);
    await settleShell(tester);
    expect(shell.path, Routes.inventoryProducts);
    expect(find.byKey(_overlay), findsNothing);
    expect(_bodyRect(tester), body);
  });

  testWidgets('sidebar menu checks the current mode and changes the layout', (
    tester,
  ) async {
    useShellWindow(tester, _desktop);
    await pumpRailShell(tester, Routes.inventorySales, page: _page);
    final l10n = shellL10n(tester);
    await tester.tap(find.byTooltip(l10n.appearanceSidebarTitle));
    await settleShell(tester);
    final items = tester.widgetList<CheckedPopupMenuItem<SidebarBehavior>>(
      find.byType(CheckedPopupMenuItem<SidebarBehavior>),
    );
    expect(items.map((item) => item.value), SidebarBehavior.values);
    expect(
      items.singleWhere((item) => item.checked).value,
      SidebarBehavior.expanded,
    );
    await tester.tap(find.text(l10n.appearanceSidebarHover));
    await settleShell(tester);
    expect(_bodyRect(tester).left, shellNavigationRailExtent);
  });

  testWidgets('Settings Appearance changes the same sidebar preference', (
    tester,
  ) async {
    useShellWindow(tester, const Size(1000, 700));
    await pumpRailShell(
      tester,
      Routes.settingsAppearance,
      page: (_) => const SizedBox.expand(
        key: _body,
        child: SingleChildScrollView(child: AppearanceSidebarSection()),
      ),
    );
    expect(_bodyRect(tester).left, shellNavigationRailExtent);
    final l10n = shellL10n(tester);
    await tester.tap(find.text(l10n.appearanceSidebarTitle));
    await settleShell(tester);
    await tester.tap(find.text(l10n.appearanceSidebarExpanded));
    await settleShell(tester);
    expect(_bodyRect(tester).left, shellNavigationSidebarExtent);
  });

  testWidgets(
    'minimal opens with keyboard focus and closes when focus leaves',
    (tester) async {
      useShellWindow(tester, _desktop);
      final bodyFocus = FocusNode();
      addTearDown(bodyFocus.dispose);
      await pumpRailShell(
        tester,
        Routes.inventorySales,
        sidebarBehavior: 'minimal',
        page: (_) => Focus(
          focusNode: bodyFocus,
          child: const SizedBox.expand(key: _body),
        ),
      );
      final icon = find.descendant(
        of: find.byKey(_logo),
        matching: find.byType(Image),
      );
      Focus.of(tester.element(icon)).requestFocus();
      await settleShell(tester);
      expect(find.byKey(_overlay), findsOneWidget);
      final body = _bodyRect(tester);
      bodyFocus.requestFocus();
      await settleShell(tester);
      expect(find.byKey(_overlay), findsNothing);
      expect(_bodyRect(tester), body);
    },
  );

  testWidgets('sidebar shortcuts toggle modes and defer to text editors', (
    tester,
  ) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.linux;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    useShellWindow(tester, _desktop);
    final editor = FocusNode();
    addTearDown(editor.dispose);
    await pumpRailShell(
      tester,
      Routes.inventorySales,
      page: (_) => SizedBox.expand(
        key: _body,
        child: Material(
          child: Center(
            child: TextField(
              focusNode: editor,
              decoration: const InputDecoration(hintText: 'Search'),
            ),
          ),
        ),
      ),
    );

    expect(_bodyRect(tester).left, shellNavigationSidebarExtent);
    await _shortcut(tester);
    expect(_bodyRect(tester).left, shellNavigationRailExtent);
    // Cmd is the macOS modifier; Linux binds Ctrl only.
    await _shortcut(tester, command: true);
    expect(_bodyRect(tester).left, shellNavigationRailExtent);
    await _shortcut(tester);
    expect(_bodyRect(tester).left, shellNavigationSidebarExtent);
    await _shortcut(tester, alt: true);
    expect(_bodyRect(tester).left, shellSidebarMinimalExtent);
    await _shortcut(tester);
    expect(_bodyRect(tester).left, shellNavigationRailExtent);

    editor.requestFocus();
    await tester.pump();
    expect(editor.hasFocus, isTrue);
    await _shortcut(tester);
    await _shortcut(tester, alt: true);
    expect(_bodyRect(tester).left, shellNavigationRailExtent);
  });

  testWidgets('a phone keeps its dock with a saved sidebar mode', (
    tester,
  ) async {
    useShellWindow(tester, const Size(390, 844));
    await pumpRailShell(
      tester,
      Routes.inventorySales,
      sidebarBehavior: 'minimal',
      page: _page,
    );
    expect(_bodyRect(tester).left, 0);
    expect(find.byKey(_logo), findsNothing);
    expect(find.byType(ShellNavigationRail), findsNothing);
    expect(find.byKey(const ValueKey('adaptive-shell-rail')), findsNothing);
    expect(
      find.descendant(
        of: find.byType(PersistentShellDock),
        matching: find.byType(ShellDockSurface),
      ),
      findsOneWidget,
    );
    await _shortcut(tester, alt: true);
    expect(_bodyRect(tester).width, 390);
  });
}
