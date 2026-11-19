import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/view/finance_invoices_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/pump_app.dart';
import 'finance_scenes.dart';

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
    await seedFinanceSceneCache();
  });

  testWidgets('invoices can be edited and open outstanding subscriptions', (
    tester,
  ) async {
    final repository = _InvoiceRepository();
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpThemedHome(
      FinanceScreenScene(
        scene: FinanceScene.overview,
        page: RepositoryProvider<FinanceRepository>.value(
          value: repository,
          child: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () => unawaited(
                  openFinanceInvoices(
                    context,
                    wallets: const [
                      Wallet(id: 'primary', name: 'Cash', currency: 'VND'),
                    ],
                    currency: 'VND',
                  ),
                ),
                child: const Text('Open invoice list'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open invoice list'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Quinn'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Receipt provided');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(repository.saved, ('invoice-1', 'Receipt provided'));
    await tester.tap(find.text('Subscriptions'));
    await tester.pumpAndSettle();
    expect(find.text('Morgan'), findsOneWidget);
    await tester.tap(find.text('Morgan'));
    await tester.pumpAndSettle();
    expect(find.text('Collect subscription payment'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class _InvoiceRepository extends FinanceSceneRepository {
  (String, String?)? saved;

  @override
  Future<FinancePageResult<FinanceInvoice>> getInvoices(
    String workspace, {
    String query = '',
    int page = 1,
  }) async => (
    items: const [
      FinanceInvoice(
        id: 'invoice-1',
        customer: 'Quinn',
        walletId: 'primary',
        total: 120,
      ),
    ],
    count: 1,
  );

  @override
  Future<FinancePageResult<FinancePendingInvoice>> getPendingInvoices(
    String workspace, {
    String query = '',
    int page = 1,
  }) async => (
    items: const [
      FinancePendingInvoice(
        customerId: 'member',
        customer: 'Morgan',
        groups: ['class'],
        months: ['2026-11'],
      ),
    ],
    count: 1,
  );

  @override
  Future<void> updateInvoice({
    required String workspace,
    required String id,
    required String? notice,
    required String? note,
  }) async {
    saved = (id, note);
  }
}
