import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';

import 'shell_rail_harness.dart';

/// A representative standard page built only from the foundation primitives.
Widget _primitivePage(String route) => Builder(
  builder: (context) => AppPageListView(
    children: [
      Text(
        'Documents',
        key: const ValueKey('primitive-title'),
        style: Theme.of(
          context,
        ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: AppLayout.sectionGap),
      for (final (caption, rows) in [
        ('Recent', ['Roadmap', 'Meeting notes', 'Launch checklist']),
        ('Shared with me', ['Design review', 'Budget']),
      ])
        AppGroupedSection.spaced(
          caption: caption,
          children: [
            for (final row in rows)
              ListTile(
                minTileHeight: AppLayout.rowMinHeight,
                leading: const Icon(Icons.description_outlined),
                title: Text(row),
                subtitle: const Text('Edited today'),
                trailing: const Icon(Icons.chevron_right),
              ),
          ],
        ),
    ],
  ),
);

void main() {
  setUpAll(loadRailRenderFonts);
  setUp(mockShellBackChannel);

  for (final (name, size, gutter) in [
    ('phone', const Size(390, 844), 16.0),
    ('tablet-portrait', const Size(768, 1024), 24.0 + 84),
    // Beside the 240dp sidebar: (1040 - 720) / 2 centring.
    ('desktop', const Size(1280, 800), 32.0 + 160),
  ]) {
    testWidgets('page primitives use body-width gutters on $name', (
      tester,
    ) async {
      useShellWindow(tester, size);
      await pumpRailShell(tester, Routes.inventorySales, page: _primitivePage);
      final rail = find.byType(ShellNavigationRail);
      final railMode = shellNavigationModeFor(size) == ShellNavigationMode.rail;
      expect(rail, railMode ? findsOneWidget : findsNothing);
      final bodyStart = shellNavigationExtentFor(size);
      final bodyWidth = size.width - bodyStart;
      final expected = AppPageInsets.resolve(width: bodyWidth).left;
      final title = tester.getRect(
        find.byKey(const ValueKey('primitive-title')),
      );
      expect(title.left - bodyStart, closeTo(expected, 0.5));
      expect(expected, closeTo(gutter, 0.5));
      expect(tester.takeException(), isNull);
      await captureRailShell(tester, 'design-foundation-$name');
    });
  }

  testWidgets('expanded mini apps keep Back ahead of rail destinations', (
    tester,
  ) async {
    useShellWindow(tester, const Size(1280, 800));
    final shell = await pumpRailShell(tester, Routes.apps);
    shell.router.go(Routes.inventorySales);
    await settleShell(tester);
    final l10n = shellL10n(tester);

    expect(find.byType(ShellNavigationRail), findsOneWidget);
    expect(find.byType(MorphingNavigationBar), findsNothing);
    expect(railItem(l10n.navBack), findsOneWidget);
    expect(find.bySemanticsLabel(l10n.navBack), findsOneWidget);
    expect(railItem(l10n.inventoryProductsLabel), findsOneWidget);
    expect(
      tester.getTopLeft(railItem(l10n.navBack)).dy,
      lessThan(tester.getTopLeft(railItem(l10n.inventoryProductsLabel)).dy),
    );
    expect(
      find.byKey(const ValueKey('persistent-shell-dock-material')),
      findsNothing,
    );

    await tester.tap(find.bySemanticsLabel(l10n.navBack));
    await settleShell(tester);
    expect(shell.path, Routes.apps);
    expect(railItem(l10n.navHome), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('system Back still works when the rail replaces the dock', (
    tester,
  ) async {
    useShellWindow(tester, const Size(1280, 800));
    final shell = await pumpRailShell(tester, Routes.apps);
    shell.router.go(Routes.inventorySales);
    await settleShell(tester);

    await tester.binding.handlePopRoute();
    await settleShell(tester);
    expect(shell.path, Routes.apps);
    expect(tester.takeException(), isNull);
  });

  testWidgets('deep links open directly into the rail layout', (tester) async {
    useShellWindow(tester, const Size(1280, 800));
    final shell = await pumpRailShell(tester, Routes.inventorySales);
    final l10n = shellL10n(tester);

    expect(find.text(Routes.inventorySales), findsOneWidget);
    expect(railItem(l10n.navBack), findsOneWidget);
    expect(find.bySemanticsLabel(l10n.navBack), findsOneWidget);
    await tester.tap(find.bySemanticsLabel(l10n.navBack));
    await settleShell(tester);
    // A cold deep link has no recorded app origin, so Back exits to Home.
    expect(shell.path, Routes.home);
    expect(railItem(l10n.navHome), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('prefixed mini-app Back appears only in the dock Back zone', (
    tester,
  ) async {
    useShellWindow(tester, const Size(390, 844));
    final shell = await pumpRailShell(
      tester,
      Routes.inventorySales,
      page: (location) => ShellMiniNav(
        ownerId: 'fixture',
        locations: {location},
        deepLinkBackRoute: Routes.apps,
        items: const [
          ShellMiniNavItemSpec(
            id: 'fixture-back',
            icon: Icons.chevron_left,
            label: 'Back',
          ),
          ShellMiniNavItemSpec(
            id: 'fixture-sales',
            icon: Icons.receipt_long,
            label: 'Sales',
            selected: true,
          ),
          ShellMiniNavItemSpec(
            id: 'fixture-products',
            icon: Icons.list,
            label: 'Products',
          ),
        ],
      ),
    );
    final back = find.bySemanticsLabel(shellL10n(tester).navBack);
    expect(back, findsOneWidget);
    await tester.tap(back);
    await settleShell(tester);
    expect(shell.path, Routes.home);
  });

  testWidgets('phones in landscape keep the floating dock', (tester) async {
    useShellWindow(tester, const Size(844, 390));
    await pumpRailShell(tester, Routes.apps);
    expect(find.byType(ShellNavigationRail), findsNothing);
    expect(find.byType(MorphingNavigationBar), findsOneWidget);
  });
}
