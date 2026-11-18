import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/account_switcher_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens the account switcher with Add account and Manage accounts, then
/// switches to the picked stored account and reports the outcome.
Future<void> showProfileAccountSwitcher(BuildContext context) async {
  final authCubit = context.read<AuthCubit>();
  await authCubit.syncCurrentSessionToStore();
  if (!context.mounted) return;

  if (authCubit.state.accounts.isEmpty) {
    showAppToast(context, message: context.l10n.authNoStoredAccounts);
    return;
  }

  final selected = await showAccountSwitcherSheet(
    context,
    onAddAccount: () => _startAddAccountFlow(context),
    onManageAccounts: () async {
      if (context.mounted) await context.push(Routes.settingsAccounts);
    },
  );
  if (!context.mounted ||
      selected == null ||
      selected == authCubit.state.activeAccountId) {
    return;
  }

  final success = await authCubit.switchAccount(selected);
  if (!context.mounted) return;
  showAppToast(
    context,
    message: success
        ? context.l10n.authSwitchAccountSuccess
        : authCubit.state.error ?? context.l10n.authSwitchAccountFailed,
    variant: success ? AppAlertVariant.neutral : AppAlertVariant.destructive,
  );
}

Future<void> _startAddAccountFlow(BuildContext context) async {
  final authCubit = context.read<AuthCubit>();
  final started = await authCubit.beginAddAccountFlow();
  if (!context.mounted) return;
  if (!started) {
    showAppToast(
      context,
      message: authCubit.state.error ?? context.l10n.authAddAccountFailed,
      variant: AppAlertVariant.destructive,
    );
    return;
  }
  context.go(Routes.addAccount);
}

/// Confirms, then signs the current account out of this device. Another
/// saved account takes over when one exists.
Future<void> confirmProfileSignOut(BuildContext context) async {
  final l10n = context.l10n;
  final authCubit = context.read<AuthCubit>();
  final confirmed = await showAppConfirmDialog(
    context: context,
    title: l10n.authLogOutConfirmDialogTitle,
    message: l10n.authLogOutConfirmDialogBody,
    confirmLabel: l10n.settingsSignOut,
    cancelLabel: l10n.commonCancel,
    destructive: true,
  );
  if (confirmed) await authCubit.signOutCurrentAccount();
}
