import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// The accounts illustration, what the page is for, and Add account.
class ManageAccountsHero extends StatelessWidget {
  const ManageAccountsHero({required this.onAddAccount, super.key});

  final VoidCallback? onAddAccount;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(
        children: [
          const AppIllustration(AppIllustrationKind.accounts, size: 150),
          const AppGap(AppSpacing.md),
          Text(
            l10n.authManageAccountsDescription,
            textAlign: TextAlign.center,
            style: tokens.typography.bodySm.copyWith(color: c.mutedForeground),
          ),
          const AppGap(AppSpacing.lg),
          SizedBox(
            width: double.infinity,
            child: AppButton.secondary(
              key: const ValueKey('manage-accounts-add'),
              size: AppButtonSize.large,
              alignment: Alignment.center,
              leading: const Icon(LucideIcons.plus),
              onPressed: onAddAccount,
              child: Text(l10n.authAddAccount),
            ),
          ),
        ],
      ),
    );
  }
}

/// The trailing action of a [ManageAccountRow].
class ManageAccountAction {
  const ManageAccountAction({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.destructive = false,
    this.busy = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool destructive;
  final bool busy;
}

/// A saved account: avatar, name, email or session state, and its actions.
class ManageAccountRow extends StatelessWidget {
  const ManageAccountRow({
    required this.identity,
    required this.action,
    this.active = false,
    this.expired = false,
    this.onSignInAgain,
    super.key,
  });

  final AccountIdentity identity;
  final ManageAccountAction action;
  final bool active;

  /// The saved session no longer refreshes; [onSignInAgain] restores it.
  final bool expired;
  final VoidCallback? onSignInAgain;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final warning = SorbetTokens.maybeOf(context)?.hues.orange.ink ?? c.warning;
    final ink = action.destructive ? c.destructive : c.foreground;
    return AppCard(
      borderColor: active ? c.foreground : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AccountAvatar(identity: identity, isSelected: active, size: 44),
              const SizedBox(width: AppSpacing.md + 2),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      identity.name,
                      style: tokens.typography.ui.copyWith(color: c.foreground),
                    ),
                    if (identity.email case final email?)
                      Text(
                        email,
                        style: tokens.typography.caption.copyWith(
                          color: c.mutedForeground,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    if (expired)
                      Text(
                        l10n.authSessionExpired,
                        key: const ValueKey('manage-account-expired'),
                        style: tokens.typography.caption.copyWith(
                          color: warning,
                        ),
                      ),
                  ],
                ),
              ),
              if (active)
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: c.primary,
                    shape: BoxShape.circle,
                  ),
                  child: SizedBox.square(
                    dimension: 22,
                    child: Semantics(
                      label: l10n.authCurrentAccountBadge,
                      child: Icon(
                        LucideIcons.check,
                        size: 13,
                        color: c.primaryForeground,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const AppGap(AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            alignment: WrapAlignment.end,
            children: [
              if (expired)
                AppButton.primary(
                  key: const ValueKey('manage-account-sign-in-again'),
                  size: AppButtonSize.small,
                  onPressed: action.busy ? null : onSignInAgain,
                  child: Text(l10n.authSignInAgain),
                ),
              if (action.busy)
                const SizedBox.square(
                  dimension: 32,
                  child: Center(child: NovaLoadingIndicator(size: 20)),
                )
              else
                AppButton.outline(
                  size: AppButtonSize.small,
                  onPressed: action.onPressed,
                  leading: Icon(action.icon, size: 16, color: ink),
                  child: Text(action.label, style: TextStyle(color: ink)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
