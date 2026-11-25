import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/inventory/inventory_stock_movement.dart';

import '../../../helpers/design_render_harness.dart';
import 'inventory_items_fixture.dart';

const _tablet = Size(834, 1194);

/// Picker chips scroll horizontally; wide test glyphs push some offscreen.
Future<void> _tapChip(WidgetTester tester, String label) async {
  await tester.ensureVisible(find.text(label));
  await tester.pumpAndSettle();
  await tester.tap(find.text(label));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(DesignRender.loadFonts);

  group('two-pane detail', () {
    testWidgets('a tap selects the item beside the list', (tester) async {
      final (:inventory, shell: _) = await pumpItemsPage(tester, size: _tablet);
      expect(find.text('Select a product'), findsOneWidget);
      await tester.tap(find.text('House blend beans'));
      await tester.pumpAndSettle();
      expect(openedDetails, isEmpty);
      expect(find.text('Select a product'), findsNothing);
      expect(find.text('Stock by location'), findsOneWidget);
      // The row and the pane header both carry the classification.
      expect(find.text('Coffee · Hill Roasters'), findsNWidgets(2));
      expect(find.text('Back room'), findsOneWidget);
      expect(find.text('Stock history'), findsOneWidget);
      expect(find.text('+12 Bag'), findsOneWidget);
      expect(find.text('−2 Bag'), findsOneWidget);
      expect(inventory.historyRequests, [('beans', 0)]);
      expect(find.text('Booth team'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('history pages on demand', (tester) async {
      final (:inventory, shell: _) = await pumpItemsPage(
        tester,
        size: _tablet,
        initialProductId: 'beans',
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Load more'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(inventory.historyRequests, [('beans', 0), ('beans', 2)]);
      expect(find.text('Load more'), findsNothing);
    });

    testWidgets('managers get edit, adjust and delete; viewers do not', (
      tester,
    ) async {
      await pumpItemsPage(tester, size: _tablet, initialProductId: milkId);
      expect(find.text('Oat milk'), findsNWidgets(2));
      expect(find.text('Edit'), findsNothing);
      expect(find.byTooltip('Delete'), findsNothing);
    });

    testWidgets('managers see the actions', (tester) async {
      await pumpItemsPage(
        tester,
        size: _tablet,
        initialProductId: milkId,
        permissions: managerPermissions,
        shadApp: true,
      );
      expect(find.text('Edit'), findsOneWidget);
      expect(find.text('Adjust stock'), findsOneWidget);
      expect(find.byTooltip('Delete'), findsOneWidget);
    });
  });

  group('filters', () {
    testWidgets('category queries the server', (tester) async {
      final (:inventory, shell: _) = await pumpItemsPage(tester);
      await _tapChip(tester, 'Category');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Coffee').last);
      await tester.pumpAndSettle();
      expect(inventory.categoryCalls.last, 'category-coffee');
      expect(find.text('House blend beans'), findsOneWidget);
      expect(find.text('Oat milk'), findsNothing);
    });

    testWidgets('stock and warehouse filter the loaded rows', (tester) async {
      final (:inventory, shell: _) = await pumpItemsPage(tester);
      final calls = inventory.calls.length;
      await _tapChip(tester, 'Stock');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Low stock'));
      await tester.pumpAndSettle();
      expect(inventory.calls, hasLength(calls));
      expect(find.text('House blend beans'), findsOneWidget);
      expect(find.text('Oat milk'), findsNothing);
      await _tapChip(tester, 'Low stock');
      await tester.tap(find.text('Any stock'));
      await tester.pumpAndSettle();
      await _tapChip(tester, 'Warehouse');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Kiosk'));
      await tester.pumpAndSettle();
      expect(find.text('House blend beans'), findsOneWidget);
      expect(find.text('Tasting session'), findsOneWidget);
      expect(find.text('Oat milk'), findsNothing);
    });

    testWidgets('no match offers to clear the filters', (tester) async {
      await pumpItemsPage(tester);
      await _tapChip(tester, 'Stock');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Out of stock'));
      await tester.pumpAndSettle();
      expect(find.text('No products match these filters'), findsOneWidget);
      await tester.tap(find.text('Clear filters'));
      await tester.pumpAndSettle();
      expect(find.text('Oat milk'), findsOneWidget);
    });

    testWidgets('sort asks the server for the chosen order', (tester) async {
      final (:inventory, shell: _) = await pumpItemsPage(tester);
      await _tapChip(tester, 'Newest');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Name A–Z'));
      await tester.pumpAndSettle();
      expect(inventory.sortCalls.last, InventoryProductSort.nameAsc);
    });
  });
}
