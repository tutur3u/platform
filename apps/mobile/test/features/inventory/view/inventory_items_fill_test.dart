import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/inventory/inventory_catalog_signal.dart';

import '../../../helpers/design_render_harness.dart';
import 'inventory_items_fixture.dart';

/// [count] items; the ones at [outFrom] and after, plus [alsoOut], are
/// out of stock.
List<InventoryProduct> _catalog(
  int count,
  int outFrom, {
  Set<int> alsoOut = const {},
}) => [
  for (var index = 0; index < count; index++)
    item(
      'item-$index',
      'Item ${index.toString().padLeft(3, '0')}',
      stock: [
        itemStock(
          'Main store',
          'Bag',
          index >= outFrom || alsoOut.contains(index) ? 0 : 5,
        ),
      ],
    ),
];

Future<void> _pick(WidgetTester tester, String chip, String choice) async {
  await tester.ensureVisible(find.text(chip));
  await tester.pumpAndSettle();
  await tester.tap(find.text(chip));
  await tester.pumpAndSettle();
  await tester.tap(find.text(choice).last);
  await tester.pumpAndSettle();
}

List<int> _pages(FakeItemsRepository inventory) => [
  for (final call in inventory.calls) call.page,
];

void main() {
  setUpAll(DesignRender.loadFonts);

  testWidgets('a stock filter loads further pages until rows match', (
    tester,
  ) async {
    final (:inventory, shell: _) = await pumpItemsPage(
      tester,
      catalog: _catalog(100, 80),
    );
    expect(_pages(inventory), [1]);
    await _pick(tester, 'Stock', 'Out of stock');
    // Page 3 brings 10 matches, under the target, so page 4 follows.
    expect(_pages(inventory), [1, 2, 3, 4]);
    expect(find.text('Item 080'), findsOneWidget);
    expect(find.text('Item 000'), findsNothing);
    expect(find.text('No products match these filters'), findsNothing);
  });

  testWidgets('a reload with a stock filter fills again', (tester) async {
    final (:inventory, shell: _) = await pumpItemsPage(
      tester,
      catalog: _catalog(100, 80),
    );
    await _pick(tester, 'Stock', 'Out of stock');
    inventory.calls.clear();
    await tester.ensureVisible(find.text('All').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('All').first);
    await tester.pumpAndSettle();
    expect(_pages(inventory), [1, 2, 3, 4]);
    expect(find.text('Item 080'), findsOneWidget);
  });

  testWidgets('a spent budget offers to search more, not an empty list', (
    tester,
  ) async {
    final (:inventory, shell: _) = await pumpItemsPage(
      tester,
      catalog: _catalog(200, 185),
    );
    await _pick(tester, 'Stock', 'Out of stock');
    // The first page plus four fill pages, then it stops and says so.
    expect(_pages(inventory), [1, 2, 3, 4, 5]);
    expect(find.text('No matches in the first 150 products'), findsOneWidget);
    expect(find.text('No products match these filters'), findsNothing);
    await tester.tap(find.text('Search more products'));
    await tester.pumpAndSettle();
    expect(_pages(inventory), [1, 2, 3, 4, 5, 6, 7]);
    expect(find.text('Item 185'), findsOneWidget);
  });

  testWidgets('a reload during a fill starts its own fill', (tester) async {
    final (:inventory, shell: _) = await pumpItemsPage(
      tester,
      catalog: _catalog(100, 80),
      configure: (repo) =>
          repo.holdWhen = (call) => call.status == 'active' && call.page == 2,
    );
    await tester.ensureVisible(find.text('Stock'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stock'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Out of stock').last);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    // The first fill waits on page 2 while the status changes.
    expect(_pages(inventory), [1, 2]);
    await tester.tap(find.text('All').first);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    inventory.release();
    await tester.pumpAndSettle();
    expect(
      [
        for (final call in inventory.calls)
          if (call.status == 'all') call.page,
      ],
      [1, 2, 3, 4],
    );
    expect(find.text('Item 080'), findsOneWidget);
    expect(find.text('No products match these filters'), findsNothing);
  });

  testWidgets('a failed reload during a fill keeps its retry state', (
    tester,
  ) async {
    final (:inventory, shell: _) = await pumpItemsPage(
      tester,
      catalog: _catalog(100, 80),
      configure: (repo) => repo
        ..holdWhen = ((call) => call.status == 'active' && call.page == 2)
        ..failWhen = ((call) => call.status == 'all'),
    );
    await tester.ensureVisible(find.text('Stock'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stock'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Out of stock').last);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.tap(find.text('All').first);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    inventory.release();
    await tester.pumpAndSettle();
    // The unwinding fill does not start pages for the failed request.
    expect(
      [
        for (final call in inventory.calls)
          if (call.status == 'all') call.page,
      ],
      [1],
    );
    expect(find.text("Couldn't load products"), findsOneWidget);
  });

  testWidgets('a spent budget with matches says where they come from', (
    tester,
  ) async {
    await pumpItemsPage(tester, catalog: _catalog(200, 185, alsoOut: {5}));
    await _pick(tester, 'Stock', 'Out of stock');
    expect(find.text('Item 005'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Showing matches from the first 150 products'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('No matches in the first 150 products'), findsNothing);
  });

  group('compact detail return', () {
    testWidgets('keeps the loaded rows when nothing changed', (tester) async {
      final (:inventory, shell: _) = await pumpItemsPage(tester);
      final calls = inventory.calls.length;
      await tester.tap(find.text('Oat milk'));
      await tester.pumpAndSettle();
      expect(openedDetails, [milkId]);
      expect(inventory.calls, hasLength(calls));
    });

    testWidgets('reloads after the detail saved a change', (tester) async {
      final (:inventory, shell: _) = await pumpItemsPage(
        tester,
        openDetail: (_, _) async => inventoryCatalogRevision.value++,
      );
      final calls = inventory.calls.length;
      await tester.tap(find.text('Oat milk'));
      await tester.pumpAndSettle();
      expect(inventory.calls.length, greaterThan(calls));
    });
  });
}
