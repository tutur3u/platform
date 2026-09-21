import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/account_switcher_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<void> showProfileAccountSwitcher(BuildContext context) async {
  final authCubit = context.read<AuthCubit>();
  final toastContext = Navigator.of(context, rootNavigator: true).context;
  await authCubit.syncCurrentSessionToStore();
  if (!context.mounted) {
    return;
  }

  final currentState = authCubit.state;
  final accounts = [...currentState.accounts]
    ..sort((a, b) => b.lastActiveAt.compareTo(a.lastActiveAt));

  if (accounts.isEmpty) {
    if (!toastContext.mounted) {
      return;
    }
    shad.showToast(
      context: toastContext,
      builder: (toastContext, _) =>
          shad.Alert(title: Text(toastContext.l10n.authNoStoredAccounts)),
    );
    return;
  }

  final selected = await showAccountSwitcherSheet(
    context,
    onAddAccount: () => _startAddAccountFlow(context),
    onManageAccounts: () => _openManageAccountsPage(context),
  );

  if (!context.mounted || selected == null) {
    return;
  }

  final latestState = authCubit.state;
  if (selected == latestState.activeAccountId) {
    return;
  }

  final success = await authCubit.switchAccount(selected);
  if (!context.mounted) {
    return;
  }
  if (!toastContext.mounted) {
    return;
  }

  shad.showToast(
    context: toastContext,
    builder: (toastContext, _) => success
        ? shad.Alert(title: Text(toastContext.l10n.authSwitchAccountSuccess))
        : shad.Alert.destructive(
            title: Text(
              authCubit.state.error ??
                  toastContext.l10n.authSwitchAccountFailed,
            ),
          ),
  );
}

Future<void> _startAddAccountFlow(BuildContext context) async {
  final authCubit = context.read<AuthCubit>();
  final toastContext = Navigator.of(context, rootNavigator: true).context;
  final started = await authCubit.beginAddAccountFlow();
  if (!context.mounted) {
    return;
  }
  if (!started) {
    if (!toastContext.mounted) {
      return;
    }
    shad.showToast(
      context: toastContext,
      builder: (toastContext, _) => shad.Alert.destructive(
        title: Text(
          authCubit.state.error ?? toastContext.l10n.authAddAccountFailed,
        ),
      ),
    );
    return;
  }
  context.go(Routes.addAccount);
}

Future<void> _openManageAccountsPage(BuildContext context) async {
  if (!context.mounted) {
    return;
  }
  await context.push(Routes.profileAccounts);
}
