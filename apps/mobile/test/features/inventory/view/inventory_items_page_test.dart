import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';

import '../../../helpers/design_render_harness.dart';
import 'inventory_items_fixture.dart';

void main() {
  setUpAll(DesignRender.loadFonts);

  testWidgets('rows roll stock up per item with category and locations', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await pumpItemsPage(tester);
    expect(find.text('House blend beans'), findsOneWidget);
    expect(find.text('Coffee · Hill Roasters'), findsOneWidget);
    // One unit everywhere, so locations add up; a low row marks it low.
    expect(find.text('31 Bag · Low'), findsOneWidget);
    expect(find.text('4 locations'), findsOneWidget);
    expect(find.text('3.5 Carton'), findsOneWidget);
    expect(find.text('Unlimited'), findsOneWidget);
    expect(find.text('No stock configured'), findsOneWidget);
    expect(find.text('Festival mugs'), findsNothing);
    expect(
      find.bySemanticsLabel(RegExp('Oat milk, Dairy-free, 3.5 Carton')),
      findsOneWidget,
    );
    expect(find.byTooltip('Delete'), findsNothing);
    expect(tester.takeException(), isNull);
    await DesignRender.capture(tester, 'inventory-items-light');
    semantics.dispose();
  });

  testWidgets('a tap opens the item for viewers too', (tester) async {
    await pumpItemsPage(tester);
    await tester.tap(find.text('Oat milk'));
    await tester.pumpAndSettle();
    expect(openedDetails, [milkId]);
  });

  testWidgets('dark render', (tester) async {
    await pumpItemsPage(tester, brightness: Brightness.dark);
    expect(tester.takeException(), isNull);
    await DesignRender.capture(tester, 'inventory-items-dark');
  });

  testWidgets('catalog managers get the dock create action', (tester) async {
    final (inventory: _, :shell) = await pumpItemsPage(
      tester,
      permissions: managerPermissions,
      shadApp: true,
    );
    // Under the router the page primary action moves into the shell dock.
    final create = shell.state
        .resolveForLocation('/test')
        .where((spec) => spec.id == 'page-primary-action')
        .single;
    expect(create.tooltip, 'Create product');
    expect(create.inDock, isTrue);
  });

  testWidgets('without view-stock the rows say stock is hidden', (
    tester,
  ) async {
    await pumpItemsPage(tester, permissions: const {'view_inventory_catalog'});
    expect(find.text('Stock hidden'), findsNWidgets(4));
    expect(find.text('No stock configured'), findsNothing);
    expect(find.byTooltip('Create product'), findsNothing);
  });

  testWidgets('create-sales permission also shows stock, like the API', (
    tester,
  ) async {
    await pumpItemsPage(
      tester,
      permissions: const {'view_inventory_catalog', 'create_inventory_sales'},
    );
    expect(find.text('Stock hidden'), findsNothing);
    expect(find.text('31 Bag · Low'), findsOneWidget);
    expect(find.text('No stock configured'), findsOneWidget);
  });

  testWidgets('status pills query the server status', (tester) async {
    final (:inventory, shell: _) = await pumpItemsPage(tester);
    await tester.tap(find.text('Archived'));
    await tester.pumpAndSettle();
    expect(inventory.calls.last.status, 'archived');
    expect(find.text('Festival mugs'), findsOneWidget);
    expect(find.text('Oat milk'), findsNothing);
    await tester.tap(find.text('All'));
    await tester.pumpAndSettle();
    expect(inventory.calls.last.status, 'all');
    expect(find.text('Festival mugs'), findsOneWidget);
    expect(find.text('Oat milk'), findsOneWidget);
  });

  testWidgets('scan action hides when no scanner exists on the host', (
    tester,
  ) async {
    final (inventory: _, :shell) = await pumpItemsPage(tester);
    final ids = shell.state
        .resolveForLocation(Routes.inventoryProducts)
        .map((spec) => spec.id);
    expect(ids, isNot(contains('${Routes.inventoryProducts}-scan')));
    expect(ids, contains('${Routes.inventoryProducts}-search'));
  });

  testWidgets('managers long-press for edit and delete', (tester) async {
    await pumpItemsPage(tester, permissions: managerPermissions, shadApp: true);
    await tester.longPress(find.text('Oat milk'));
    await tester.pumpAndSettle();
    expect(find.text('Edit'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
  });

  testWidgets('viewers get no long-press actions', (tester) async {
    await pumpItemsPage(tester);
    await tester.longPress(find.text('Oat milk'));
    await tester.pumpAndSettle();
    expect(find.text('Edit'), findsNothing);
    expect(find.text('Delete'), findsNothing);
  });
}
