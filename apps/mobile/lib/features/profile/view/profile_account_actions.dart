import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/account_switcher_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// Presents the in-memory account list immediately and routes account actions.
Future<void> showProfileAccountSwitcher(
  BuildContext context, {
  UserProfile? profile,
  String? avatarUrl,
}) async {
  final selected = await showAccountSwitcherSheet(
    context,
    profile: profile,
    avatarUrl: avatarUrl,
  );
  if (!context.mounted || selected == null) return;
  if (selected.action == AccountSwitcherAction.manage) {
    await context.push(Routes.settingsAccounts);
    return;
  }

  final authCubit = context.read<AuthCubit>();
  final started = await authCubit.beginAddAccountFlow(email: selected.email);
  if (!context.mounted) return;
  if (started) {
    context.go(Routes.addAccount);
  } else {
    showAppToast(
      context,
      message: context.l10n.authAddAccountFailed,
      variant: AppAlertVariant.destructive,
    );
  }
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
    confirmLabel: l10n.authLogOut,
    cancelLabel: l10n.commonCancel,
    destructive: true,
  );
  if (confirmed) await authCubit.signOutCurrentAccount();
}
