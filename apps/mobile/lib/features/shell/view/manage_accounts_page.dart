import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart'
    show SettingsSection;
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/features/shell/view/manage_account_row.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/staggered_entry.dart';

class ManageAccountsPage extends StatefulWidget {
  const ManageAccountsPage({super.key});

  @override
  State<ManageAccountsPage> createState() => _ManageAccountsPageState();
}

class _ManageAccountsPageState extends State<ManageAccountsPage> {
  String? _removingAccountId;
  String? _loggingOutAccountId;

  @override
  void initState() {
    super.initState();
    unawaited(context.read<AuthCubit>().syncCurrentSessionToStore());
  }

  bool get _isMutating =>
      _removingAccountId != null || _loggingOutAccountId != null;

  /// Add account, or sign an expired saved account in again ([email]
  /// prefills the form), through the same add-account flow.
  Future<void> _startAddAccountFlow({String? email}) async {
    final authCubit = context.read<AuthCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final started = await authCubit.beginAddAccountFlow(email: email);
    if (!mounted) {
      return;
    }
    if (!started) {
      if (!toastContext.mounted) {
        return;
      }
      showAppToast(
        toastContext,
        message: authCubit.state.error ?? context.l10n.authAddAccountFailed,
        variant: AppAlertVariant.destructive,
      );
      return;
    }

    context.go(Routes.addAccount);
  }

  Future<void> _removeAccount(StoredAuthAccount account) async {
    final accountLabel = accountPrimaryLabel(account);
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: context.l10n.authRemoveAccount,
      description: context.l10n.authRemoveAccountConfirm(accountLabel),
      confirmLabel: context.l10n.authRemoveAccount,
      icon: Icons.delete_outline_rounded,
      isDestructive: true,
    );

    if (confirmed != true || !mounted) {
      return;
    }

    setState(() => _removingAccountId = account.id);
    final authCubit = context.read<AuthCubit>();
    final success = await authCubit.removeAccount(account.id);
    if (!mounted) {
      return;
    }

    setState(() => _removingAccountId = null);
    _showMutationToast(
      success: success,
      fallbackError: context.l10n.authRemoveAccountFailed,
      successMessage: context.l10n.authRemoveAccountSuccess,
    );
  }

  Future<void> _logOutCurrentAccount(StoredAuthAccount account) async {
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: context.l10n.authLogOutConfirmDialogTitle,
      description: context.l10n.authLogOutCurrentConfirm,
      confirmLabel: context.l10n.authLogOut,
      icon: Icons.logout_rounded,
      isDestructive: true,
    );

    if (confirmed != true || !mounted) {
      return;
    }

    setState(() => _loggingOutAccountId = account.id);
    final authCubit = context.read<AuthCubit>();
    final success = await authCubit.signOutCurrentAccount();
    if (!mounted) {
      return;
    }

    setState(() => _loggingOutAccountId = null);
    _showMutationToast(
      success: success,
      fallbackError: context.l10n.authLogOutCurrentFailed,
      successMessage: context.l10n.authLogOutCurrentSuccess,
    );
  }

  void _showMutationToast({
    required bool success,
    required String fallbackError,
    required String successMessage,
  }) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) {
      return;
    }

    final authCubit = context.read<AuthCubit>();
    if (success && authCubit.state.revocationUnconfirmed) return;
    showAppToast(
      toastContext,
      message: success
          ? successMessage
          : authCubit.state.error ?? fallbackError,
      variant: success ? AppAlertVariant.neutral : AppAlertVariant.destructive,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<AuthCubit, AuthState>(
      builder: (context, state) {
        final accounts = sortStoredAccountsByRecent(state.accounts);
        final activeAccount = accounts
            .where((account) => account.id == state.user?.id)
            .firstOrNull;
        final savedAccounts = activeAccount == null
            ? accounts
            : accounts
                  .where((account) => account.id != activeAccount.id)
                  .toList(growable: false);

        return AppPageListView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          children: [
            StaggeredEntry(
              index: 0,
              playOnceKey: 'manage-accounts-hero',
              child: ManageAccountsHero(
                onAddAccount: _isMutating ? null : _startAddAccountFlow,
              ),
            ),
            const AppGap(AppSpacing.xl),
            if (activeAccount != null) ...[
              StaggeredEntry(
                index: 1,
                playOnceKey: 'manage-accounts-current',
                child: SettingsSection(
                  title: l10n.authCurrentAccountTitle,
                  description: l10n.authCurrentAccountDescription,
                  children: [
                    ManageAccountRow(
                      identity: savedAccountIdentity(activeAccount),
                      active: true,
                      action: ManageAccountAction(
                        label: l10n.authLogOut,
                        icon: LucideIcons.logOut,
                        destructive: true,
                        busy: _loggingOutAccountId == activeAccount.id,
                        onPressed: _isMutating
                            ? null
                            : () => _logOutCurrentAccount(activeAccount),
                      ),
                    ),
                  ],
                ),
              ),
              const AppGap(AppSpacing.xl),
            ],
            StaggeredEntry(
              index: 2,
              playOnceKey: 'manage-accounts-saved',
              child: SettingsSection(
                title: l10n.authSavedAccountsTitle,
                description: l10n.authSavedAccountsDescription,
                children: savedAccounts.isEmpty
                    ? [
                        AppCard(
                          child: Text(
                            l10n.authManageAccountsEmpty,
                            style: AppTokens.of(context).typography.bodySm
                                .copyWith(
                                  color: AppTokens.of(
                                    context,
                                  ).colorScheme.mutedForeground,
                                ),
                          ),
                        ),
                      ]
                    : [
                        for (final account in savedAccounts)
                          ManageAccountRow(
                            key: ValueKey('manage-account-${account.id}'),
                            identity: savedAccountIdentity(account),
                            expired: state.expiredAccountIds.contains(
                              account.id,
                            ),
                            onSignInAgain: _isMutating
                                ? null
                                : () => _startAddAccountFlow(
                                    email: account.email,
                                  ),
                            action: ManageAccountAction(
                              label: l10n.authRemoveAccount,
                              icon: LucideIcons.trash2,
                              destructive: true,
                              busy: _removingAccountId == account.id,
                              onPressed: _isMutating
                                  ? null
                                  : () => _removeAccount(account),
                            ),
                          ),
                      ],
              ),
            ),
          ],
        );
      },
    );
  }
}
