import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/tag.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/l10n/l10n.dart';

final financeSceneDate = DateTime(2026, 11, 18, 9, 30);

const _wallets = [
  Wallet(id: 'wallet-vnd', name: 'Everyday', balance: 1250000, currency: 'VND'),
  Wallet(id: 'wallet-usd', name: 'Savings', balance: 1240, currency: 'USD'),
  Wallet(
    id: 'credit-vnd',
    name: 'Credit',
    balance: -542000,
    currency: 'VND',
    type: 'CREDIT',
  ),
];

class FinanceSceneRepository extends FinanceRepository {
  @override
  String? peekWorkspaceDefaultCurrency(String wsId) => 'VND';

  @override
  Future<String> getWorkspaceDefaultCurrency(
    String wsId, {
    bool forceRefresh = false,
  }) async => 'VND';

  @override
  Future<List<Wallet>> getWallets(String wsId) async => _wallets;

  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async => const [
    TransactionCategory(id: 'food', name: 'Groceries', icon: 'ShoppingCart'),
    TransactionCategory(id: 'home', name: 'Home', icon: 'House'),
    TransactionCategory(id: 'transport', name: 'Transport', icon: 'Car'),
    TransactionCategory(id: 'coffee', name: 'Coffee', icon: 'Coffee'),
    TransactionCategory(id: 'health', name: 'Health', icon: 'Heart'),
    TransactionCategory(id: 'gifts', name: 'Gifts', icon: 'Gift'),
    TransactionCategory(id: 'shopping', name: 'Shopping', icon: 'ShoppingBag'),
    TransactionCategory(id: 'other', name: 'Other', icon: 'Ellipsis'),
    TransactionCategory(id: 'salary', name: 'Salary', isExpense: false),
  ];

  @override
  Future<List<FinanceTag>> getTags(String wsId) async => const [];
}

class FinanceOverviewScene extends StatelessWidget {
  const FinanceOverviewScene({super.key});

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final chrome = ShellChromeStyle.of(context);
    final state = FinanceState(
      status: FinanceStatus.loaded,
      wallets: _wallets,
      workspaceCurrency: 'VND',
      exchangeRates: const [
        ExchangeRate(
          baseCurrency: 'USD',
          targetCurrency: 'VND',
          rate: 25000,
          date: '2026-11-18',
        ),
      ],
      recentTransactions: [
        Transaction(
          id: 'groceries',
          description: 'Market groceries',
          amount: -420000,
          categoryName: 'Groceries',
          categoryIcon: 'ShoppingCart',
          walletName: 'Everyday',
          walletCurrency: 'VND',
          takenAt: financeSceneDate,
        ),
        Transaction(
          id: 'salary',
          description: 'November payroll',
          amount: 32000000,
          categoryName: 'Salary',
          walletName: 'Everyday',
          walletCurrency: 'VND',
          takenAt: financeSceneDate.subtract(const Duration(days: 1)),
        ),
        Transaction(
          id: 'book',
          description: 'Design books',
          amount: -32,
          categoryName: 'Education',
          walletName: 'Savings',
          walletCurrency: 'USD',
          takenAt: financeSceneDate.subtract(const Duration(days: 2)),
        ),
      ],
    );
    return ColoredBox(
      color: chrome.page,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Padding(
            padding: EdgeInsets.only(top: media.padding.top + 56),
            child: MediaQuery(
              data: media.copyWith(
                padding: media.padding.copyWith(
                  top: 0,
                  bottom: AppPageInsets.contentBottomClearance(
                    context,
                    safeBottom: media.padding.bottom,
                  ),
                ),
              ),
              child: FinanceOverviewContent(
                state: state,
                showAmounts: true,
                onTransactionTap: (_) {},
                onCreate: () {},
              ),
            ),
          ),
          Positioned(
            top: media.padding.top,
            left: 16,
            right: 16,
            height: 56,
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Finance',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                ShellTopBarButton(
                  icon: const Icon(Icons.visibility_outlined),
                  highlighted: true,
                  onPressed: () {},
                ),
                ShellTopBarButton(
                  icon: const Icon(AppIcons.add),
                  filled: true,
                  onPressed: () {},
                ),
              ],
            ),
          ),
          Positioned(
            bottom: ShellDockMetrics.bottomOffset(media.padding.bottom),
            left: 12,
            right: 12,
            child: Center(
              child: SizedBox(
                width: ShellDockMetrics.widthFor(media.size.width),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  spacing: ShellDockMetrics.zoneGap,
                  children: [
                    Expanded(
                      child: ShellDockBar(
                        entries: [
                          for (final item in AppRegistry.moduleById(
                            'finance',
                          )!.miniAppNavItems)
                            ShellDockEntry(
                              key: ValueKey(item.id),
                              label: item.label(context.l10n),
                              glyph: Icon(item.icon),
                            ),
                        ],
                        selectedKey: const ValueKey('finance_home'),
                        onSelected: (_) {},
                        back: const ShellDockEntry(
                          key: ValueKey('back'),
                          label: 'Back',
                          glyph: Icon(AppIcons.back),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(
                        bottom: ShellDockMetrics.padding,
                      ),
                      child: ShellDockActionButton(
                        action: ShellActionSpec.search(
                          id: 'finance-search',
                          active: false,
                          tooltip: context.l10n.financeSearchTransactions,
                          onPressed: () {},
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
