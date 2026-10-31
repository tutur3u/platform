import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/design_render_harness.dart';
import 'inventory_items_fixture.dart';

void main() {
  setUpAll(DesignRender.loadFonts);

  group('filters and loading', () {
    testWidgets('a slow filter never shows the previous filter rows', (
      tester,
    ) async {
      final (:inventory, shell: _) = await pumpItemsPage(
        tester,
        configure: (repo) =>
            repo.holdWhen = (call) => call.status == 'archived',
      );
      expect(find.text('Oat milk'), findsOneWidget);
      await tester.tap(find.text('Archived'));
      await tester.pump();
      await tester.pump();
      expect(inventory.calls.last.status, 'archived');
      expect(find.text('Oat milk'), findsNothing);
      expect(find.text('Festival mugs'), findsNothing);
      inventory.release();
      await tester.pumpAndSettle();
      expect(find.text('Festival mugs'), findsOneWidget);
      expect(find.text('Oat milk'), findsNothing);
    });

    testWidgets('a failed filter shows an error, not the old rows', (
      tester,
    ) async {
      await pumpItemsPage(
        tester,
        configure: (repo) =>
            repo.failWhen = (call) => call.status == 'archived',
      );
      await tester.tap(find.text('Archived'));
      await tester.pumpAndSettle();
      expect(find.text('Oat milk'), findsNothing);
      expect(find.text("Couldn't load products"), findsOneWidget);
      expect(find.text('No archived products'), findsNothing);
    });

    testWidgets('a failed first load offers retry instead of an empty list', (
      tester,
    ) async {
      var fail = true;
      final (:inventory, shell: _) = await pumpItemsPage(
        tester,
        configure: (repo) => repo.failWhen = (_) => fail,
      );
      expect(find.text("Couldn't load products"), findsOneWidget);
      expect(find.text('No products yet'), findsNothing);
      fail = false;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Oat milk'), findsOneWidget);
      expect(find.text("Couldn't load products"), findsNothing);
      expect(inventory.calls.length, greaterThanOrEqualTo(2));
    });

    testWidgets('a failed page shows a retry footer and waits for it', (
      tester,
    ) async {
      var failPageTwo = true;
      final (:inventory, shell: _) = await pumpItemsPage(
        tester,
        catalog: [
          for (var i = 0; i < 40; i++)
            item('item-$i', 'Item ${i.toString().padLeft(2, '0')}'),
        ],
        configure: (repo) =>
            repo.failWhen = (call) => call.page == 2 && failPageTwo,
      );
      final list = find.byType(Scrollable).first;
      await tester.drag(list, const Offset(0, -6000));
      await tester.pumpAndSettle();
      expect(inventory.calls.where((c) => c.page == 2), hasLength(1));
      // Scrolling the failure into view must not retry on its own.
      await tester.scrollUntilVisible(
        find.text("Couldn't load more products"),
        200,
        scrollable: list,
      );
      await tester.pumpAndSettle();
      expect(inventory.calls.where((c) => c.page == 2), hasLength(1));
      failPageTwo = false;
      await tester.ensureVisible(find.text('Retry'));
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text("Couldn't load more products"), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Item 39'),
        400,
        scrollable: list,
      );
      expect(find.text('Item 39'), findsOneWidget);
    });
  });

  group('scan', () {
    testWidgets('a plain code searches by name and can be cleared', (
      tester,
    ) async {
      final (:inventory, :shell) = await pumpItemsPage(
        tester,
        scanCode: (_) async => 'oat',
      );
      itemsAction(shell, 'scan').onPressed!();
      await tester.pumpAndSettle();
      expect(inventory.calls.last.query, 'oat');
      expect(find.text('Name matches for “oat”'), findsOneWidget);
      expect(find.text('Oat milk'), findsOneWidget);
      expect(find.text('House blend beans'), findsNothing);
      await tester.tap(find.text('Clear'));
      await tester.pumpAndSettle();
      expect(inventory.calls.last.query, '');
      expect(find.text('House blend beans'), findsOneWidget);
    });

    testWidgets('a product link opens the editor for managers', (tester) async {
      final opened = <String?>[];
      final (:inventory, :shell) = await pumpItemsPage(
        tester,
        permissions: managerPermissions,
        shadApp: true,
        scanCode: (_) async => productLink(milkId),
        openEditor: (_, productId) async {
          opened.add(productId);
          return false;
        },
      );
      itemsAction(shell, 'scan').onPressed!();
      await tester.pumpAndSettle();
      expect(inventory.productRequests, [milkId]);
      expect(opened, [milkId]);
      expect(inventory.calls.last.query, '');
    });

    testWidgets('a product link finds the item by name for viewers', (
      tester,
    ) async {
      final (:inventory, :shell) = await pumpItemsPage(
        tester,
        scanCode: (_) async => productLink(milkId),
      );
      itemsAction(shell, 'scan').onPressed!();
      await tester.pumpAndSettle();
      expect(inventory.productRequests, [milkId]);
      expect(inventory.calls.last.query, 'Oat milk');
      expect(find.text('House blend beans'), findsNothing);
    });

    testWidgets('an archived product link widens a viewer search to all', (
      tester,
    ) async {
      final (:inventory, :shell) = await pumpItemsPage(
        tester,
        scanCode: (_) async => productLink(mugsId),
      );
      itemsAction(shell, 'scan').onPressed!();
      await tester.pumpAndSettle();
      expect(inventory.calls.last, (
        query: 'Festival mugs',
        status: 'all',
        page: 1,
      ));
      expect(find.text('Festival mugs'), findsOneWidget);
    });

    testWidgets('an unknown product link shows the not-found toast', (
      tester,
    ) async {
      final (:inventory, :shell) = await pumpItemsPage(
        tester,
        scanCode: (_) async => productLink(missingId),
      );
      final before = inventory.calls.length;
      itemsAction(shell, 'scan').onPressed!();
      await tester.pump();
      await tester.pump();
      expect(
        find.text('No product in this workspace matches this code.'),
        findsOneWidget,
      );
      expect(inventory.calls, hasLength(before));
      await settleToast(tester);
    });

    for (final payload in [
      'https://example.com/promo',
      'WIFI:T:WPA;S:Booth;P:hunter2;;',
      'otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP',
    ]) {
      testWidgets('rejects $payload without a request', (tester) async {
        final (:inventory, :shell) = await pumpItemsPage(
          tester,
          scanCode: (_) async => payload,
        );
        final before = inventory.calls.length;
        itemsAction(shell, 'scan').onPressed!();
        await tester.pump();
        await tester.pump();
        expect(
          find.text("This code can't be matched to a product."),
          findsOneWidget,
        );
        expect(inventory.calls, hasLength(before));
        expect(inventory.productRequests, isEmpty);
        expect(find.textContaining('hunter2'), findsNothing);
        await settleToast(tester);
      });
    }
  });
}
