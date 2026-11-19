import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_interest.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/view/finance_reports_sheet.dart';
import 'package:mobile/features/finance/view/wallet_interest_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import 'finance_scenes.dart';

void main() {
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
    testWidgets('wallet tools render in ${brightness.name}', (tester) async {
      final repository = _WalletToolsRepository();
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.pumpWidget(
        DesignRenderApp(
          settings: DesignRender.themes[brightness.name]!.$1,
          brightness: brightness,
          child: FinanceScreenScene(
            scene: FinanceScene.overview,
            showAmounts: true,
            page: RepositoryProvider<FinanceRepository>.value(
              value: repository,
              child: Builder(
                builder: (context) => Column(
                  children: [
                    TextButton(
                      onPressed: () => unawaited(
                        showWalletInterest(
                          context,
                          wallet: 'wallet-vnd',
                          currency: 'VND',
                        ),
                      ),
                      child: const Text('Open interest'),
                    ),
                    TextButton(
                      onPressed: () => unawaited(
                        openFinanceReports(
                          context,
                          wallets: const [
                            Wallet(
                              id: 'wallet-vnd',
                              name: 'Savings',
                              currency: 'VND',
                            ),
                          ],
                          currency: 'VND',
                        ),
                      ),
                      child: const Text('Open reports'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open interest'));
      await tester.pumpAndSettle();
      expect(find.text('ZaloPay'), findsOneWidget);
      expect(find.text('24.000 ₫'), findsOneWidget);
      await DesignRender.capture(tester, 'wallet-interest-${brightness.name}');
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open reports'));
      await tester.pumpAndSettle();
      expect(find.text('Savings'), findsOneWidget);
      expect(find.text('Rent'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'wallet-report-${brightness.name}');
    });
  }
}

class _WalletToolsRepository extends FinanceSceneRepository {
  @override
  Future<WalletInterest> getWalletInterest(
    String workspace,
    String wallet,
  ) async => WalletInterest.fromJson({
    'config': {'provider': 'zalopay', 'enabled': true, 'zalopay_tier': 'gold'},
    'currentRate': {'annual_rate': 4.8},
    'todayInterest': 800,
    'monthToDateInterest': 12000,
    'yearToDateInterest': 160000,
    'totalEarnedInterest': 200000,
    'projections': {
      'month': [
        {'projectedCumulativeInterest': 24000},
      ],
    },
    'rateHistory': [
      {'annual_rate': 4.8, 'effective_from': '2026-11-01'},
    ],
  });

  @override
  Future<List<Transaction>> getReportTransactions({
    required String workspace,
    required String wallet,
    required FinanceTransactionQuery query,
    required bool Function() active,
  }) async => [
    Transaction(id: 'in', amount: 3000000, takenAt: query.start),
    Transaction(
      id: 'out',
      amount: -1600000,
      categoryId: 'rent',
      categoryName: 'Rent',
      takenAt: query.start!.add(const Duration(days: 2)),
    ),
  ];
}
