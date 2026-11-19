import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/features/finance/utils/checkpoint_variance.dart';
import 'package:mobile/features/finance/view/wallet_detail_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import '../view/finance_scenes.dart';

void main() {
  test('checkpoint variance retains the direction of the adjustment', () {
    expect(checkpointVariance(110, 125), -15);
    expect(checkpointVariance(-50, -70), 20);
    expect(checkpointVariance(0, 0), 0);
    expect(checkpointVariance(10.2, 10.1), closeTo(0.1, 1e-12));
  });

  test(
    'balance input accepts signed localized decimals and rejects non-money',
    () {
      expect(parseCheckpointBalance(' -10,25 '), -10.25);
      expect(parseCheckpointBalance('+9.5'), 9.5);
      expect(parseCheckpointBalance('0'), 0);
      expect(parseCheckpointBalance('1,234.50'), isNull);
      expect(parseCheckpointBalance('NaN'), isNull);
      expect(parseCheckpointBalance('Infinity'), isNull);
      expect(parseCheckpointBalance(''), isNull);
    },
  );

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
    testWidgets(
      'wallet balance review previews variance in ${brightness.name}',
      (tester) async {
        final repository = _ReconciliationRepository();
        DesignRender.setSize(tester, DesignRender.sizes['phone']!);
        await tester.pumpWidget(
          DesignRenderApp(
            settings: DesignRender.themes[brightness.name]!.$1,
            brightness: brightness,
            child: FinanceScreenScene(
              scene: FinanceScene.walletDetail,
              showAmounts: true,
              page: WalletDetailPage(
                walletId: 'wallet-vnd',
                repository: repository,
                now: financeSceneDate,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Checkpoint timeline'));
        await tester.pumpAndSettle();
        await DesignRender.capture(
          tester,
          'wallet-timeline-${brightness.name}',
        );
        await tester.tap(find.text('Reconcile'));
        await tester.pumpAndSettle();
        final input = find.byType(TextField).first;
        await tester.enterText(input, '150');
        await tester.pumpAndSettle();
        final surplus = find.text('+25 ₫');
        expect(
          tester.widget<Text>(surplus).style?.color,
          tester.element(surplus).tokens.colorScheme.success,
        );
        await tester.enterText(input, '100');
        await tester.pumpAndSettle();

        final variance = find.text('−25 ₫');
        expect(variance, findsOneWidget);
        final text = tester.widget<Text>(variance);
        final context = tester.element(variance);
        expect(text.style?.color, context.tokens.colorScheme.destructive);
        expect(find.text('Save reviewed balance'), findsOneWidget);
        FocusManager.instance.primaryFocus?.unfocus();
        await tester.pumpAndSettle();
        await DesignRender.capture(
          tester,
          'wallet-reconciliation-${brightness.name}',
        );
        await tester.tap(find.text('Save reviewed balance'));
        await tester.pumpAndSettle();
        expect(repository.review?.actualBalance, 100);
        expect(repository.adjustmentBasis, isNull);
        await tester.tap(find.byKey(const ValueKey('reviewed-checkpoint')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Create adjustment transaction'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Create adjustment transaction'));
        await tester.pumpAndSettle();
        expect(repository.adjustmentBasis, 'checkpoint');
        expect(find.text('−25 ₫'), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

class _ReconciliationRepository extends FinanceSceneRepository {
  WalletCheckpoint? review;
  String? adjustmentBasis;

  @override
  Future<WalletCheckpoint> createWalletCheckpoint({
    required String wsId,
    required String walletId,
    required double actualBalance,
    required DateTime checkedAt,
    String? note,
  }) async {
    final checkpoint = WalletCheckpoint(
      id: 'reviewed-checkpoint',
      walletId: walletId,
      actualBalance: actualBalance,
      ledgerBalance: 125,
      currentLedgerBalance: 125,
      originalVariance: actualBalance - 125,
      currentVariance: actualBalance - 125,
      currency: 'VND',
      checkedAt: checkedAt,
      createdAt: checkedAt,
      updatedAt: checkedAt,
    );
    review = checkpoint;
    return checkpoint;
  }

  @override
  Future<WalletCheckpointListResponse> getWalletCheckpoints({
    required String wsId,
    required String walletId,
    int limit = 50,
    bool forceRefresh = false,
  }) async {
    final checkpoint = review;
    if (checkpoint == null) {
      return await super.getWalletCheckpoints(wsId: wsId, walletId: walletId);
    }
    final data = adjustmentBasis == null
        ? checkpoint
        : WalletCheckpoint.fromJson({
            ...checkpoint.toJson(),
            'current_ledger_balance': checkpoint.actualBalance,
            'current_variance': 0,
          });
    return WalletCheckpointListResponse(
      data: [data],
      intervals: const [],
      latest: data,
    );
  }

  @override
  Future<WalletCheckpointReconciliationResponse> reconcileWalletCheckpoint({
    required String wsId,
    required String walletId,
    required String checkpointId,
    required String basis,
    String? categoryId,
    String? description,
  }) async {
    adjustmentBasis = basis;
    return WalletCheckpointReconciliationResponse(
      checkedAt: review!.checkedAt,
      checkpointId: checkpointId,
      walletId: walletId,
      created: true,
      offsetAmount: review!.currentVariance,
    );
  }

  @override
  Future<Wallet?> getWalletById({
    required String wsId,
    required String walletId,
  }) async =>
      Wallet(id: walletId, name: 'Everyday', currency: 'VND', balance: 125);
}
