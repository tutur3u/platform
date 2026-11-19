import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
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
          title: l10n.authSwitchAccount,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (active != null)
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: c.primary.withValues(alpha: 0.07),
                    border: Border.all(
                      color: c.primary.withValues(alpha: 0.25),
                    ),
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                  child: _AccountTile(identity: active, active: true),
                ),
              for (final account in others)
                _AccountTile(
                  key: ValueKey('switch-account-${account.id}'),
                  identity: savedAccountIdentity(account),
                  switching: state.switchingAccountId == account.id,
                  signInRequired: state.expiredAccountIds.contains(account.id),
                  failed: _failedAccountId == account.id,
                  enabled: !busy,
                  onTap: () => unawaited(_switchTo(account)),
                ),
              const SizedBox(height: AppSpacing.sm),
              Divider(height: 1, color: c.border),
              const SizedBox(height: AppSpacing.xs),
              AppListTile(
                leading: Icon(LucideIcons.userPlus, color: c.primary),
                title: Text(l10n.authAddAccount),
                enabled: !busy,
                onTap: () => _select(AccountSwitcherAction.add),
              ),
              AppListTile(
                leading: const Icon(LucideIcons.settings2),
                title: Text(l10n.authManageAccounts),
                trailing: const Icon(AppIcons.forward, size: 16),
                enabled: !busy,
                onTap: () => _select(AccountSwitcherAction.manage),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({
    required this.identity,
    this.active = false,
    this.switching = false,
    this.signInRequired = false,
    this.failed = false,
    this.enabled = true,
    this.onTap,
    super.key,
  });

  final AccountIdentity identity;
  final bool active;
  final bool switching;
  final bool signInRequired;
  final bool failed;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final status = signInRequired
        ? l10n.authSignInAgain
        : failed
        ? l10n.authSwitchAccountFailed
        : null;
    return AppListTile(
      selected: active,
      enabled: enabled,
      onTap: switching ? null : onTap,
      leading: AccountAvatar(identity: identity, isSelected: active),
      title: Text(
        identity.name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
      subtitle: identity.email == null && status == null
          ? null
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (identity.email case final email?)
                  Text(email, maxLines: 1, overflow: TextOverflow.ellipsis),
                if (status != null)
                  Text(
                    status,
                    style: TextStyle(
                      color: signInRequired ? c.primary : c.destructive,
                    ),
                  ),
              ],
            ),
      trailing: switching
          ? SizedBox.square(
              dimension: 18,
              child: CircularProgressIndicator(
                key: const ValueKey('account-switch-progress'),
                color: c.primary,
                strokeWidth: 2,
                semanticsLabel: l10n.commonLoading,
              ),
            )
          : active
          ? Icon(
              LucideIcons.circleCheck,
              key: const ValueKey('active-account-check'),
              color: c.primary,
            )
          : const Icon(AppIcons.forward, size: 16),
    );
  }
}
