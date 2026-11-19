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
                      Wallet(id: 'backup', name: 'Savings', currency: 'VND'),
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
    await tester.tap(find.text('Invoice reports'));
    await tester.pumpAndSettle();
    expect(find.text('By wallet'), findsOneWidget);
    expect(find.text('By creator'), findsOneWidget);
    expect(find.text('3 invoices'), findsNWidgets(3));
    tester.state<NavigatorState>(find.byType(Navigator).first).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Quinn'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Receipt provided');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(repository.saved, ('invoice-1', 'Receipt provided'));
    await tester.tap(find.text('Quinn'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Change invoice wallet'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Savings'));
    await tester.pumpAndSettle();
    expect(repository.moved, ('invoice-1', 'backup'));
    await tester.tap(find.text('Invoice history'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archived customer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Restore invoice').last);
    await tester.pumpAndSettle();
    expect(repository.restored, 'archived-invoice');
    tester.state<NavigatorState>(find.byType(Navigator).first).pop();
    await tester.pumpAndSettle();
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
  (String, String)? moved;
  String? restored;

  @override
  Future<void> moveInvoiceWallet({
    required String workspace,
    required String id,
    required String walletId,
  }) async {
    moved = (id, walletId);
  }

  @override
  Future<FinancePageResult<FinanceInvoiceEvent>> getInvoiceHistory(
    String workspace, {
    required String query,
    required int page,
    required bool deleted,
  }) async => (
    items: [
      if (restored == null)
        FinanceInvoiceEvent.fromJson({
          'id': 'archived-event',
          'invoice_id': 'archived-invoice',
          'operation': 'DELETE',
          'customer_name': 'Archived customer',
          'can_restore': true,
        }),
    ],
    count: restored == null ? 1 : 0,
  );

  @override
  Future<void> restoreInvoice(String workspace, String id) async {
    restored = id;
  }

  @override
  Future<FinanceInvoiceReport> getInvoiceReport(
    String workspace, {
    required String from,
    required String through,
    required String granularity,
  }) async {
    final period = DateTime.parse(from);
    return (
      wallets: <FinanceInvoiceReportRow>[
        (id: 'primary', name: 'Cash', period: period, count: 3, amount: 120),
      ],
      creators: <FinanceInvoiceReportRow>[
        (id: 'creator', name: 'Quinn', period: period, count: 3, amount: 120),
      ],
    );
  }

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
