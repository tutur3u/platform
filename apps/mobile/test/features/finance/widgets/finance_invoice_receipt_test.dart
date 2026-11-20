import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/features/finance/widgets/finance_invoice_receipt.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import '../view/finance_scenes.dart';

final _detail = FinanceInvoiceDetail.fromJson(const {
  'id': 'invoice-1',
  'price': 1500000,
  'total_diff': -150000,
  'customer_name': 'Quinn Tran',
  'wallet_name': 'Everyday',
  'wallet_currency': 'VND',
  'created_at': '2026-11-18T02:30:00Z',
  'notice': 'November lessons',
  'products': [
    {
      'product_name': 'Private lesson',
      'product_unit': 'session',
      'amount': 4,
      'price': 300000,
    },
    {
      'product_name': 'Workbook',
      'product_unit': 'copy',
      'amount': '1',
      'price': '300000',
    },
  ],
  'promotions': [
    {'code': 'SPRING10', 'name': 'Spring sale', 'value': 10, 'use_ratio': true},
  ],
});

void main() {
  test('invoice detail totals the lines and keeps the discount signed', () {
    expect(_detail.lines.map((line) => line.total), [1200000, 300000]);
    expect(_detail.total, 1350000);
    expect(_detail.promotions.single.code, 'SPRING10');
  });

  group('receipt', () {
    setUpAll(() async {
      SharedPreferences.setMockInitialValues({});
      await Supabase.initialize(
        url: 'https://example.supabase.co',
        publishableKey: 'test-anon-key',
      );
      await seedFinanceSceneCache();
      await DesignRender.loadFonts();
    });

    for (final brightness in Brightness.values) {
      testWidgets('renders lines and totals in ${brightness.name}', (
        tester,
      ) async {
        DesignRender.setSize(tester, const Size(390, 640));
        await tester.pumpWidget(
          DesignRenderApp(
            settings: DesignRender.themes[brightness.name]!.$1,
            brightness: brightness,
            child: FinanceScreenScene(
              scene: FinanceScene.overview,
              showAmounts: true,
              page: Padding(
                padding: const EdgeInsets.all(16),
                child: FinanceInvoiceReceiptLoader(
                  load: () async => _detail,
                  fallbackCurrency: 'USD',
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Quinn Tran'), findsOneWidget);
        expect(find.text('Discount · SPRING10'), findsOneWidget);
        expect(find.text('Share invoice'), findsOneWidget);
        await DesignRender.capture(
          tester,
          'finance-invoice-receipt-${brightness.name}',
        );
      });
    }

    testWidgets('offers Retry when the items cannot load', (tester) async {
      var attempts = 0;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: DesignRender.themes['light']!.$1,
          brightness: Brightness.light,
          child: Material(
            child: FinanceInvoiceReceiptLoader(
              load: () async {
                attempts++;
                throw Exception('offline');
              },
              fallbackCurrency: 'VND',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Could not load the invoice items'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(attempts, 2);
    });
  });
}
