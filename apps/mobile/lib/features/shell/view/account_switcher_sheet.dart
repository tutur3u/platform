import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/view/account_option_tile.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

enum AccountSwitcherAction { add, manage, signInAgain }

typedef AccountSwitcherSelection = ({
  AccountSwitcherAction action,
  String? email,
});

Future<AccountSwitcherSelection?> showAccountSwitcherSheet(
  BuildContext context, {
  UserProfile? profile,
  String? avatarUrl,
}) {
  final auth = context.read<AuthCubit>();
  final result = showAppSheet<AccountSwitcherSelection>(
    context: context,
    maxDialogWidth: 440,
    builder: (_) => BlocProvider.value(
      value: auth,
      child: _AccountSwitcherSheet(profile: profile, avatarUrl: avatarUrl),
    ),
  );
  WidgetsBinding.instance.addPostFrameCallback((_) {
    if (!auth.isClosed) unawaited(auth.syncCurrentSessionToStore());
  });
  return result;
}

class _AccountSwitcherSheet extends StatefulWidget {
  const _AccountSwitcherSheet({this.profile, this.avatarUrl});

  final UserProfile? profile;
  final String? avatarUrl;

  @override
  State<_AccountSwitcherSheet> createState() => _AccountSwitcherSheetState();
}

class _AccountSwitcherSheetState extends State<_AccountSwitcherSheet> {
  String? _failedAccountId;

  void _select(AccountSwitcherAction action, {String? email}) {
    Navigator.of(context).pop((action: action, email: email));
  }

  Future<void> _switchTo(StoredAuthAccount account) async {
    final auth = context.read<AuthCubit>();
    if (auth.state.expiredAccountIds.contains(account.id)) {
      _select(AccountSwitcherAction.signInAgain, email: account.email);
      return;
    }
    setState(() => _failedAccountId = null);
    final switched = await auth.switchAccount(account.id);
    if (!mounted) return;
    if (switched) {
      if (ModalRoute.isCurrentOf(context) == true) Navigator.of(context).pop();
    } else {
      setState(() => _failedAccountId = account.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return BlocBuilder<AuthCubit, AuthState>(
      buildWhen: (previous, current) =>
          previous.user != current.user ||
          previous.accounts != current.accounts ||
          previous.switchingAccountId != current.switchingAccountId ||
          previous.expiredAccountIds != current.expiredAccountIds ||
          previous.isLoading != current.isLoading,
      builder: (context, state) {
        final active = activeAccountIdentity(
          state,
          profile: widget.profile,
          avatarUrl: widget.avatarUrl,
        );
        final others = sortStoredAccountsByRecent(
          state.accounts.where((account) => account.id != active?.id),
        );
        final busy = state.switchingAccountId != null || state.isLoading;
        return AppSheetScaffold(
          title: l10n.authAccountsTitle,
          headerActions: [
            AppButton(
              key: const ValueKey('account-switcher-manage'),
              variant: AppButtonVariant.link,
              size: AppButtonSize.small,
              semanticLabel: l10n.authManageAccounts,
              onPressed: busy
                  ? null
                  : () => _select(AccountSwitcherAction.manage),
              child: Text(l10n.authManageShort),
            ),
          ],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (active != null)
                AccountOptionTile(identity: active, active: true),
              for (final account in others) ...[
                const SizedBox(height: AppSpacing.sm),
                AccountOptionTile(
                  key: ValueKey('switch-account-${account.id}'),
                  identity: savedAccountIdentity(account),
                  switching: state.switchingAccountId == account.id,
                  signInRequired: state.expiredAccountIds.contains(account.id),
                  failed: _failedAccountId == account.id,
                  enabled: !busy,
                  onTap: () => unawaited(_switchTo(account)),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              AppButton.secondary(
                key: const ValueKey('account-switcher-add'),
                size: AppButtonSize.large,
                alignment: Alignment.center,
                leading: const Icon(LucideIcons.plus),
                onPressed: busy
                    ? null
                    : () => _select(AccountSwitcherAction.add),
                child: Text(l10n.authAddAccount),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                l10n.authSwitchReloadNote,
                textAlign: TextAlign.center,
                style: tokens.typography.caption.copyWith(
                  color: c.mutedForeground,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
