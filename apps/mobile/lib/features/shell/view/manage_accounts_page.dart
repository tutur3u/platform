import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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

  Future<void> _startAddAccountFlow() async {
    final authCubit = context.read<AuthCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final started = await authCubit.beginAddAccountFlow();
    if (!mounted) {
      return;
    }
    if (!started) {
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(
            authCubit.state.error ?? context.l10n.authAddAccountFailed,
          ),
        ),
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
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => success
          ? shad.Alert(title: Text(successMessage))
          : shad.Alert.destructive(
              title: Text(authCubit.state.error ?? fallbackError),
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final horizontalPadding = ResponsivePadding.horizontal(context.deviceClass);
    return shad.Scaffold(
      child: ResponsiveWrapper(
        maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
        child: BlocBuilder<AuthCubit, AuthState>(
          builder: (context, state) {
            final accounts = sortStoredAccountsByRecent(state.accounts);
            final activeAccount = accounts
                .where((account) => account.id == state.activeAccountId)
                .firstOrNull;
            final savedAccounts = activeAccount == null
                ? accounts
                : accounts
                      .where((account) => account.id != activeAccount.id)
                      .toList(growable: false);

            return ListView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                20,
                horizontalPadding,
                32,
              ),
              children: [
                StaggeredEntry(
                  index: 0,
                  playOnceKey: 'manage-accounts-hero',
                  child: _ManageAccountsHeroCard(
                    onAddAccount: _isMutating ? null : _startAddAccountFlow,
                  ),
                ),
                const shad.Gap(28),
                if (activeAccount != null)
                  StaggeredEntry(
                    index: 1,
                    playOnceKey: 'manage-accounts-current',
                    child: SettingsSection(
                      title: context.l10n.authCurrentAccountTitle,
                      description: context.l10n.authCurrentAccountDescription,
                      children: [
                        _ManageAccountCard(
                          account: activeAccount,
                          badgeLabel: context.l10n.authCurrentAccountBadge,
                          badgeIcon: Icons.check_circle_rounded,
                          actionLabel: context.l10n.authLogOut,
                          actionIcon: Icons.logout_rounded,
                          isBusy: _loggingOutAccountId == activeAccount.id,
                          onAction: _isMutating
                              ? null
                              : () => _logOutCurrentAccount(activeAccount),
                          actionDestructive: true,
                        ),
                      ],
                    ),
                  ),
                if (activeAccount != null) const shad.Gap(28),
                StaggeredEntry(
                  index: 2,
                  playOnceKey: 'manage-accounts-saved',
                  child: SettingsSection(
                    title: context.l10n.authSavedAccountsTitle,
                    description: context.l10n.authSavedAccountsDescription,
                    children: savedAccounts.isEmpty
                        ? [
                            SettingsPanel(
                              child: Text(
                                context.l10n.authManageAccountsEmpty,
                                style:
                                    shad.Theme.of(
                                      context,
                                    ).typography.small.copyWith(
                                      color: shad.Theme.of(
                                        context,
                                      ).colorScheme.mutedForeground,
                                    ),
                              ),
                            ),
                          ]
                        : [
                            for (final account in savedAccounts)
                              _ManageAccountCard(
                                account: account,
                                badgeLabel: context.l10n.authSavedAccountBadge,
                                badgeIcon: Icons.devices_rounded,
                                actionLabel: context.l10n.authRemoveAccount,
                                actionIcon: Icons.delete_outline_rounded,
                                isBusy: _removingAccountId == account.id,
                                onAction: _isMutating
                                    ? null
                                    : () => _removeAccount(account),
                                actionDestructive: true,
                              ),
                          ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ManageAccountsHeroCard extends StatelessWidget {
  const _ManageAccountsHeroCard({required this.onAddAccount});

  final VoidCallback? onAddAccount;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isDark
              ? const [
                  Color(0xFF182434),
                  Color(0xFF221B39),
                  Color(0xFF12313A),
                ]
              : const [
                  Color(0xFFE9F2FF),
                  Color(0xFFF4ECFF),
                  Color(0xFFE9FBF5),
                ],
        ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.1)
              : colorScheme.primary.withValues(alpha: 0.16),
        ),
        boxShadow: [
          BoxShadow(
            color: colorScheme.primary.withValues(alpha: isDark ? 0.14 : 0.08),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Icon(
              Icons.manage_accounts_rounded,
              size: 24,
              color: colorScheme.primary,
            ),
          ),
          const shad.Gap(16),
          Text(
            context.l10n.authManageAccounts,
            style: theme.typography.h3.copyWith(fontWeight: FontWeight.w800),
          ),
          const shad.Gap(8),
          Text(
            context.l10n.authManageAccountsDescription,
            style: theme.typography.small.copyWith(
              color: colorScheme.onSurfaceVariant,
            ),
          ),
          const shad.Gap(18),
          shad.PrimaryButton(
            onPressed: onAddAccount,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.add_rounded, size: 18),
                const shad.Gap(8),
                Text(context.l10n.authAddAccount),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ManageAccountCard extends StatelessWidget {
  const _ManageAccountCard({
    required this.account,
    required this.badgeLabel,
    required this.badgeIcon,
    required this.actionLabel,
    required this.actionIcon,
    required this.isBusy,
    required this.onAction,
    required this.actionDestructive,
  });

  final StoredAuthAccount account;
  final String badgeLabel;
  final IconData badgeIcon;
  final String actionLabel;
  final IconData actionIcon;
  final bool isBusy;
  final VoidCallback? onAction;
  final bool actionDestructive;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = Theme.of(context).colorScheme;
    final title = accountPrimaryLabel(account);
    final subtitle = accountSecondaryLabel(account);

    return SettingsPanel(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AccountAvatar(account: account, size: 46),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.typography.base.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const shad.Gap(4),
                      Text(
                        subtitle,
                        style: theme.typography.small.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const shad.Gap(14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _AccountBadge(
                label: badgeLabel,
                icon: badgeIcon,
              ),
              if (isBusy)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                _AccountActionButton(
                  label: actionLabel,
                  icon: actionIcon,
                  onPressed: onAction,
                  destructive: actionDestructive,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AccountBadge extends StatelessWidget {
  const _AccountBadge({
    required this.label,
    required this.icon,
  });

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: colorScheme.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: colorScheme.primary),
          const shad.Gap(6),
          Text(
            label,
            style: theme.typography.xSmall.copyWith(
              color: colorScheme.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountActionButton extends StatelessWidget {
  const _AccountActionButton({
    required this.label,
    required this.icon,
    required this.onPressed,
    required this.destructive,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = Theme.of(context).colorScheme;
    final foreground = destructive
        ? theme.colorScheme.destructive
        : colorScheme.primary;

    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18, color: foreground),
      label: Text(
        label,
        style: theme.typography.small.copyWith(
          color: foreground,
          fontWeight: FontWeight.w700,
        ),
      ),
      style: OutlinedButton.styleFrom(
        side: BorderSide(
          color: foreground.withValues(alpha: 0.22),
        ),
        foregroundColor: foreground,
      ),
    );
  }
}
