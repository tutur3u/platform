import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/inventory/widgets/inventory_receipt_activity.dart';
import 'package:mobile/features/inventory/widgets/inventory_sales_totals.dart';

import '../../../helpers/helpers.dart';

InventorySaleSummary _sale(String id, String? currency, double amount) =>
    InventorySaleSummary(
      id: id,
      currency: currency,
      paidAmount: amount,
      itemsCount: 1,
      totalQuantity: 1,
      owners: const [],
      source: 'finance_invoice',
    );

void main() {
  testWidgets(
    'loaded revenue separates currencies and excludes unknown/pending receipts',
    (tester) async {
      await tester.pumpApp(
        ListView(
          children: [
            InventorySalesTotals(
              sales: [
                _sale('usd', 'USD', 2),
                _sale('vnd', 'VND', 3000),
                _sale('unknown', null, 123),
                _sale('pending', 'USD', 777),
                _sale('usd', 'USD', 2),
              ],
              isPending: (id) => id == 'pending',
            ),
          ],
        ),
      );
      await tester.pump();
      expect(find.text(formatCurrency(2, 'USD')), findsOneWidget);
      expect(find.text(formatCurrency(3000, 'VND')), findsOneWidget);
      expect(
        find.textContaining('1 receipt with unknown currency excluded'),
        findsOneWidget,
      );
      expect(find.textContaining('777'), findsNothing);
      expect(find.textContaining('3,002'), findsNothing);
    },
  );

  testWidgets(
    'receipt chart uses unique dated records and actual period samples',
    (tester) async {
      final now = DateTime(2026, 10, 3, 12);
      InventoryRecentSale receipt(String id, DateTime? date) =>
          InventoryRecentSale(
            id: id,
            paidAmount: 9000,
            itemsCount: 1,
            owners: const [],
            createdAt: date,
          );
      await tester.pumpApp(
        ListView(
          children: [
            InventoryReceiptActivity(
              now: now,
              sales: [
                receipt('today', now),
                receipt('today', now),
                receipt('older', DateTime(2026, 9, 15)),
                receipt('unknown', null),
              ],
            ),
          ],
        ),
      );
      await tester.pump();
      expect(
        tester
            .widgetList<LinearProgressIndicator>(
              find.byType(LinearProgressIndicator),
            )
            .length,
        1,
      );
      expect(find.text('1 record without a date'), findsOneWidget);
      expect(find.textContaining('9000'), findsNothing);
      await tester.tap(find.text('30 days'));
      await tester.pump();
      expect(
        tester
            .widgetList<LinearProgressIndicator>(
              find.byType(LinearProgressIndicator),
            )
            .length,
        2,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('analytics fit 320 pixels with large text', (tester) async {
    tester.view
      ..physicalSize = const Size(320, 1200)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpApp(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(1.8)),
          child: ListView(
            children: [
              InventoryReceiptActivity(
                sales: const [],
                now: DateTime(2026, 10, 3),
              ),
              InventorySalesTotals(
                sales: [_sale('usd', 'USD', 123456789)],
                isPending: (_) => false,
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
