import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

class FinanceReportsPage extends StatelessWidget {
  const FinanceReportsPage({super.key});

  @override
  Widget build(BuildContext context) => const FinancePage(reports: true);
}

class FinanceManagePage extends StatelessWidget {
  const FinanceManagePage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellTitleOverride(
          ownerId: 'finance-manage',
          locations: const {Routes.financeManage},
          title: l10n.financeManageLabel,
          showLeadingBrand: false,
          showAvatar: false,
        ),
        const FinanceAmountVisibilityShellAction(
          ownerId: 'finance-manage',
          locations: {Routes.financeManage},
        ),
        AppPageListView(
          children: [
            AppGroupedCard(
              children: [
                AppGroupedRow(
                  leading: const AppIconTile(icon: LucideIcons.tags),
                  title: Text(l10n.financeCategories),
                  showChevron: true,
                  onTap: () => context.push(Routes.categories),
                ),
                AppGroupedRow(
                  leading: const AppIconTile(icon: LucideIcons.wallet),
                  title: Text(l10n.financeWallets),
                  showChevron: true,
                  onTap: () => context.push(Routes.wallets),
                ),
                AppGroupedRow(
                  leading: const AppIconTile(icon: LucideIcons.listChecks),
                  title: Text(l10n.financeCheckpointsShortLabel),
                  showChevron: true,
                  onTap: () => context.push(Routes.financeCheckpoints),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}
