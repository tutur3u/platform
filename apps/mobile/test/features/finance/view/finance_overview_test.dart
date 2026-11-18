import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/utils/finance_flow.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_tone.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/pump_app.dart';

void main() {
  testWidgets('overview redacts every amount and remembers the eye toggle', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final settings = SettingsRepository();
    final preferences = FinancePreferencesCubit(settingsRepository: settings);
    addTearDown(preferences.close);
    const state = FinanceState(
      workspaceCurrency: 'USD',
      wallets: [Wallet(id: 'wallet', name: 'Everyday', balance: 50)],
      recentTransactions: [
        Transaction(id: 'income', description: 'Payroll', amount: 1000),
      ],
      monthFlow: FinanceFlow(currency: 'USD', income: 1000, expense: -75),
    );

    await tester.pumpThemedHome(
      BlocProvider.value(
        value: preferences,
        child: FinanceOverviewContent(
          state: state,
          onTransactionTap: (_) {},
          onCreate: () {},
          now: DateTime(2026, 11, 18),
        ),
      ),
    );
    expect(preferences.state.showAmounts, isFalse);
    expect(find.text(financeMaskedAmountPlaceholder), findsWidgets);
    expect(find.textContaining(r'$'), findsNothing);
    expect(find.text('Payroll'), findsOneWidget);

    await preferences.toggleShowAmounts();
    await tester.pump();
    expect(find.text(r'$50.00'), findsWidgets);
    expect(find.text(r'+$1,000.00'), findsWidgets);
    expect(find.text(r'−$75.00'), findsOneWidget);
    expect(find.text(financeMaskedAmountPlaceholder), findsNothing);

    final reloaded = FinancePreferencesCubit(settingsRepository: settings);
    addTearDown(reloaded.close);
    await reloaded.load();
    expect(reloaded.state.showAmounts, isTrue);
    await preferences.toggleShowAmounts();
    await tester.pump();
    expect(find.textContaining(r'$'), findsNothing);
    await reloaded.load();
    expect(reloaded.state.showAmounts, isFalse);
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
