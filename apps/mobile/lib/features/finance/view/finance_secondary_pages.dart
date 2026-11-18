import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/wallet_dialog.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class FinanceManagePage extends StatelessWidget {
  const FinanceManagePage({super.key});

  Future<void> _createWallet(BuildContext context) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final repository = FinanceRepository();
    await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => WalletDialog(wsId: wsId, repository: repository),
    );
  }

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
        if (canManageFinance(context, 'create_wallets'))
          AppPageListView(
            children: [
              AppGroupedCard(
                children: [
                  AppGroupedRow(
                    leading: const AppIconTile(icon: LucideIcons.wallet),
                    title: Text(l10n.financeCreateWallet),
                    showChevron: true,
                    onTap: () => _createWallet(context),
                  ),
                ],
              ),
            ],
          ),
      ],
    );
  }
}
