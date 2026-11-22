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

  bool _startingAddAccount = false;

  bool get _isMutating =>
      _startingAddAccount ||
      _removingAccountId != null ||
      _loggingOutAccountId != null;

  /// One account mutation at a time: false while this page runs one, or while
  /// the cubit loads, switches or adds an account.
  bool _canMutate(AuthState state) =>
      !_isMutating && !state.isLoading && state.switchingAccountId == null;

  /// Runs a cubit mutation. A throw is reported and read as a failure, so the
  /// caller always clears its busy flag and shows the failure toast.
  Future<bool> _guardMutation(Future<bool> Function() run) async {
    try {
      return await run();
    } on Object catch (error, stackTrace) {
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: error,
          stack: stackTrace,
          library: 'manage accounts',
        ),
      );
      return false;
    }
  }

  /// Add account, or sign an expired saved account in again ([email]
  /// prefills the form), through the same add-account flow.
  Future<void> _startAddAccountFlow({String? email}) async {
    if (_isMutating) return;
    final authCubit = context.read<AuthCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    setState(() => _startingAddAccount = true);
    final bool started;
    try {
      started = await authCubit.beginAddAccountFlow(email: email);
    } finally {
      if (mounted) setState(() => _startingAddAccount = false);
    }
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
    if (!_canMutate(context.read<AuthCubit>().state)) return;
    final accountLabel = accountPrimaryLabel(account);
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: context.l10n.authRemoveAccount,
      description: context.l10n.authRemoveAccountConfirm(accountLabel),
      confirmLabel: context.l10n.authRemoveAccount,
      icon: Icons.delete_outline_rounded,
      isDestructive: true,
    );

    // A switch or add-account may have started while the dialog was open.
    if (confirmed != true ||
        !mounted ||
        !_canMutate(context.read<AuthCubit>().state)) {
      return;
    }

    final authCubit = context.read<AuthCubit>();
    setState(() => _removingAccountId = account.id);
    final bool success;
    try {
      success = await _guardMutation(() => authCubit.removeAccount(account.id));
    } finally {
      if (mounted) setState(() => _removingAccountId = null);
    }
    if (!mounted) {
      return;
    }

    _showMutationToast(
      success: success,
      fallbackError: context.l10n.authRemoveAccountFailed,
      successMessage: context.l10n.authRemoveAccountSuccess,
    );
  }

  Future<void> _logOutCurrentAccount(StoredAuthAccount account) async {
    if (!_canMutate(context.read<AuthCubit>().state)) return;
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: context.l10n.authLogOutConfirmDialogTitle,
      description: context.l10n.authLogOutCurrentConfirm,
      confirmLabel: context.l10n.authLogOut,
      icon: Icons.logout_rounded,
      isDestructive: true,
    );

    // A switch or add-account may have started while the dialog was open.
    if (confirmed != true ||
        !mounted ||
        !_canMutate(context.read<AuthCubit>().state)) {
      return;
    }

    final authCubit = context.read<AuthCubit>();
    setState(() => _loggingOutAccountId = account.id);
    final bool success;
    try {
      success = await _guardMutation(authCubit.signOutCurrentAccount);
    } finally {
      if (mounted) setState(() => _loggingOutAccountId = null);
    }
    if (!mounted) {
      return;
    }

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
        final busy = !_canMutate(state);
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
                onAddAccount: busy ? null : _startAddAccountFlow,
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
                        onPressed: busy
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
                            onSignInAgain: busy
                                ? null
                                : () => _startAddAccountFlow(
                                    email: account.email,
                                  ),
                            action: ManageAccountAction(
                              label: l10n.authRemoveAccount,
                              icon: LucideIcons.trash2,
                              destructive: true,
                              busy: _removingAccountId == account.id,
                              onPressed: busy
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
