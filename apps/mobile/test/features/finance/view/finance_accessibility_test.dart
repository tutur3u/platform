import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/finance/view/finance_overview_balances.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/finance/view/transaction_list_page.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
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

  final displayedAmounts = {
    FinanceScene.overview: '420[,.]000',
    FinanceScene.transactions: '420[,.]000',
    FinanceScene.transactionDetail: '420[,.]000',
    FinanceScene.budgets: '3[,.]250[,.]000',
    FinanceScene.wallets: '1[,.]250[,.]000',
    FinanceScene.walletDetail: '1[,.]250[,.]000',
    FinanceScene.checkpoints: '15[,.]50',
    FinanceScene.categories: '420[,.]000',
  };
  for (final MapEntry(key: scene, value: pattern) in displayedAmounts.entries) {
    testWidgets('${scene.name} masks amounts and announces their state', (
      tester,
    ) async {
      await tester.pumpThemedHome(FinanceScreenScene(scene: scene));
      await tester.pumpAndSettle();
      if (scene == FinanceScene.transactionDetail) {
        await tester.tap(find.text('Open transaction details'));
        await tester.pumpAndSettle();
      }
      final amount = find.textContaining(RegExp(pattern));
      await pumpFinanceUntilVisible(
        tester,
        find.textContaining(financeMaskedAmountPlaceholder),
      );
      expect(amount, findsNothing);
      final hidden = find.bySemanticsLabel(RegExp('Hidden amount'));
      expect(hidden, findsWidgets);

      await tester.tap(
        scene == FinanceScene.transactionDetail
            ? find.byTooltip('Show amounts')
            : find.byKey(const ValueKey('finance-scene-eye')),
      );
      await tester.pumpAndSettle();
      expect(amount, findsWidgets);
      expect(hidden, findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  for (final scene in FinanceScene.values.where(
    (scene) => scene != FinanceScene.transactionDetail,
  )) {
    testWidgets('${scene.name} registers the eye with shell chrome', (
      tester,
    ) async {
      final chrome = ShellChromeActionsCubit();
      addTearDown(chrome.close);
      await tester.pumpThemedHome(
        BlocProvider.value(
          value: chrome,
          child: FinanceScreenScene(
            scene: scene,
            page: switch (scene) {
              FinanceScene.overview => FinancePage(
                repository: FinanceSceneRepository(),
              ),
              FinanceScene.transactions => TransactionListPage(
                repository: FinanceSceneRepository(),
                now: financeSceneDate,
              ),
              _ => null,
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final location = scene == FinanceScene.walletDetail
          ? Routes.walletDetailPath('wallet-vnd')
          : scene.route;
      final actions = chrome.state.resolveForLocation(location);
      final eye = actions.singleWhere(
        (action) => action.tooltip == 'Show amounts',
      );
      expect(eye.icon, LucideIcons.eyeOff);
      final eyeIndex = actions.indexOf(eye);
      for (final (index, action) in actions.indexed) {
        if (action.icon == LucideIcons.search) {
          expect(index, lessThan(eyeIndex));
        }
        if (action.icon == AppIcons.add) expect(index, greaterThan(eyeIndex));
      }
      // Search stays in the top bar; create takes the dock's priority slot.
      expect(
        actions.where((action) => action.icon == LucideIcons.search),
        everyElement(
          isA<ShellActionSpec>().having((a) => a.inDock, 'inDock', isFalse),
        ),
      );
      if (financeSceneCreates.contains(scene)) {
        final dock = actions.firstWhere((action) => action.inDock);
        expect(dock.icon, AppIcons.add);
        expect(dock.filled, isTrue);
      }
      eye.onPressed!();
      await tester.pumpAndSettle();
      expect(
        chrome.state
            .resolveForLocation(location)
            .singleWhere((action) => action.tooltip == 'Hide amounts')
            .icon,
        LucideIcons.eye,
      );
    });
  }

  for (final scale in [2.0, 3.0]) {
    testWidgets('balance strip fits a phone with ${scale}x text', (
      tester,
    ) async {
      await tester.pumpThemedHome(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(scale)),
            child: Center(
              child: SizedBox(
                width: 360,
                child: FinanceBalanceStrip(state: financeSceneState),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.getSize(find.byType(FinanceBalanceStrip)).height,
        greaterThan(136),
      );
      expect(find.text('Everyday'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
