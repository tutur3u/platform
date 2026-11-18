import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/components/app_card.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/finance/widgets/finance_tone.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';

import '../../../helpers/pump_app.dart';

void main() {
  testWidgets(
    'activity tiles count recent report entries without money totals',
    (tester) async {
      final state = FinanceState(
        workspaceCurrency: 'USD',
        recentTransactions: [
          Transaction(id: 'income', amount: 1000, takenAt: DateTime(2026)),
          Transaction(id: 'expense', amount: -75, takenAt: DateTime(2026, 2)),
          const Transaction(
            id: 'other-expense',
            amount: -55,
            walletCurrency: 'VND',
          ),
          const Transaction(id: 'excluded', amount: 800, reportOptIn: false),
          const Transaction(id: 'redacted'),
        ],
      );

      Widget overview({required bool showAmounts}) => FinanceOverviewContent(
        state: state,
        showAmounts: showAmounts,
        onTransactionTap: (_) {},
        onCreate: () {},
      );

      Finder tile(String label) => find.byWidget(
        tester
            .element(find.text(label))
            .findAncestorWidgetOfExactType<DecoratedBox>()!,
      );

      const income = 'Recent income entries';
      const expense = 'Recent expense entries';
      await tester.pumpThemedHome(overview(showAmounts: true));
      expect(
        find.descendant(of: tile(income), matching: find.text('1')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: tile(expense), matching: find.text('2')),
        findsOneWidget,
      );
      expect(find.textContaining('Recent in ·'), findsNothing);
      expect(
        find.descendant(of: tile(income), matching: find.textContaining(r'$')),
        findsNothing,
      );

      await tester.pumpThemedHome(overview(showAmounts: false));
      expect(
        find.descendant(
          of: tile(income),
          matching: find.text(financeMaskedAmountPlaceholder),
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('wallet cards distinguish a conversion, type and zero balance', (
    tester,
  ) async {
    const state = FinanceState(
      workspaceCurrency: 'VND',
      exchangeRates: [
        ExchangeRate(
          baseCurrency: 'USD',
          targetCurrency: 'VND',
          rate: 25000,
          date: '2026-11-18',
        ),
      ],
      wallets: [
        Wallet(
          id: 'foreign',
          name: 'Foreign wallet',
          currency: 'USD',
          balance: 1,
        ),
        Wallet(id: 'zero', name: 'Empty wallet', balance: 0),
        Wallet(id: 'credit', name: 'Credit line', balance: 20, type: 'CREDIT'),
      ],
    );
    await tester.pumpThemedHome(
      FinanceOverviewContent(
        state: state,
        showAmounts: true,
        onTransactionTap: (_) {},
        onCreate: () {},
      ),
    );
    expect(find.text('≈ ₫25,000'), findsOneWidget);
    expect(find.text('Standard'), findsNWidgets(2));
    expect(find.text('Credit'), findsOneWidget);
    AppCard wallet(String name) => tester
        .element(find.text(name))
        .findAncestorWidgetOfExactType<AppCard>()!;

    expect(
      wallet('Empty wallet').fillColor,
      isNot(wallet('Foreign wallet').fillColor),
    );
  });

  for (final sorbet in [null, const SorbetTheme()]) {
    for (final brightness in Brightness.values) {
      final design = sorbet == null ? 'classic' : 'Sorbet';
      testWidgets('$design ${brightness.name} has three AA Finance tones', (
        tester,
      ) async {
        late List<({Color fill, Color ink})> tones;
        await tester.pumpWidget(
          sorbetTestApp(
            sorbet: sorbet,
            brightness: brightness,
            home: Builder(
              builder: (context) {
                tones = [
                  for (final tone in FinanceTone.values) tone.colors(context),
                ];
                return const SizedBox.shrink();
              },
            ),
          ),
        );
        expect(tones.map((tone) => tone.ink).toSet(), hasLength(3));
        for (final tone in tones) {
          expect(
            AppearanceContrast.ratio(tone.ink, tone.fill),
            greaterThanOrEqualTo(AppearanceContrast.aaText),
          );
        }
      });
    }
  }
}
