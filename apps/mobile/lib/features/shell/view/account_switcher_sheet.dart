import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<String?> showAccountSwitcherSheet(
  BuildContext context, {
  Future<void> Function()? onAddAccount,
  Future<void> Function()? onManageAccounts,
}) async {
  final authCubit = context.read<AuthCubit>();

  return showAdaptiveSheet<String?>(
    context: context,
    maxDialogWidth: 420,
    builder: (dialogContext) {
      return BlocProvider.value(
        value: authCubit,
        child: _AccountSwitcherSheet(
          onAddAccount: onAddAccount,
          onManageAccounts: onManageAccounts,
        ),
      );
    },
  );
}

class _AccountSwitcherSheet extends StatelessWidget {
  const _AccountSwitcherSheet({
    this.onAddAccount,
    this.onManageAccounts,
  });

  final Future<void> Function()? onAddAccount;
  final Future<void> Function()? onManageAccounts;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthCubit, AuthState>(
      builder: (context, state) {
        final accounts = sortStoredAccountsByRecent(state.accounts);

        return AppDialogScaffold(
          title: context.l10n.authSwitchAccount,
          headerTrailing: _AccountSwitcherActions(
            onAddAccount: onAddAccount,
            onManageAccounts: onManageAccounts,
          ),
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          maxWidth: 420,
          maxHeightFactor: 0.76,
          actions: [
            shad.OutlineButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(context.l10n.commonCancel),
            ),
          ],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (accounts.isEmpty)
                _EmptyAccountsState(onAddAccount: onAddAccount)
              else
                Column(
                  children: [
                    for (var index = 0; index < accounts.length; index++) ...[
                      _AccountSelectionTile(
                        account: accounts[index],
                        isSelected: accounts[index].id == state.activeAccountId,
                        onTap: () => Navigator.of(
                          context,
                        ).pop<String?>(accounts[index].id),
                      ),
                      if (index != accounts.length - 1) const shad.Gap(10),
                    ],
                  ],
                ),
            ],
          ),
        );
      },
    );
  }
}

class _AccountSelectionTile extends StatelessWidget {
  const _AccountSelectionTile({
    required this.account,
    required this.isSelected,
    required this.onTap,
  });

  final StoredAuthAccount account;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = accountPrimaryLabel(account);
    final subtitle = accountSecondaryLabel(account);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: isSelected
                ? theme.colorScheme.primary.withValues(alpha: 0.1)
                : theme.colorScheme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: isSelected
                  ? theme.colorScheme.primary.withValues(alpha: 0.4)
                  : theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            children: [
              AccountAvatar(account: account, isSelected: isSelected),
              const shad.Gap(10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.typography.small.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (subtitle != null) ...[
                      const shad.Gap(3),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const shad.Gap(10),
              Icon(
                isSelected
                    ? Icons.check_circle_rounded
                    : Icons.radio_button_unchecked_rounded,
                size: 20,
                color: isSelected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccountSwitcherActions extends StatelessWidget {
  const _AccountSwitcherActions({
    required this.onAddAccount,
    required this.onManageAccounts,
  });

  final Future<void> Function()? onAddAccount;
  final Future<void> Function()? onManageAccounts;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Tooltip(
          message: context.l10n.authManageAccounts,
          child: shad.OutlineButton(
            density: shad.ButtonDensity.icon,
            onPressed: onManageAccounts == null
                ? null
                : () async {
                    Navigator.of(context).pop();
                    await onManageAccounts?.call();
                  },
            child: const Icon(Icons.manage_accounts_rounded, size: 18),
          ),
        ),
        const shad.Gap(10),
        Tooltip(
          message: context.l10n.authAddAccount,
          child: shad.PrimaryButton(
            density: shad.ButtonDensity.icon,
            onPressed: onAddAccount == null
                ? null
                : () async {
                    Navigator.of(context).pop();
                    await onAddAccount?.call();
                  },
            child: const Icon(Icons.add_rounded, size: 18),
          ),
        ),
      ],
    );
  }
}

class _EmptyAccountsState extends StatelessWidget {
  const _EmptyAccountsState({required this.onAddAccount});

  final Future<void> Function()? onAddAccount;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.authNoStoredAccounts,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const shad.Gap(6),
          Text(
            context.l10n.authAddAccountDescription,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          if (onAddAccount != null) ...[
            const shad.Gap(12),
            shad.PrimaryButton(
              onPressed: () async {
                Navigator.of(context).pop();
                await onAddAccount?.call();
              },
              child: Text(context.l10n.authAddAccount),
            ),
          ],
        ],
      ),
    );
  }
}
