import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// One account in the switcher: avatar, name and email, and its state at the
/// end. The active account carries a filled check; a switch in progress a
/// spinner; an expired session reads "Session expired" with a Sign in again
/// action, which [onTap] also triggers.
class AccountOptionTile extends StatelessWidget {
  const AccountOptionTile({
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
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final warning = SorbetTokens.maybeOf(context)?.hues.orange.ink ?? c.warning;
    final status = signInRequired
        ? (l10n.authSessionExpired, warning)
        : failed
        ? (l10n.authSwitchAccountFailed, c.destructive)
        : null;
    final radius = BorderRadius.circular(18);
    final tap = active || switching || !enabled ? null : onTap;
    final trailing = switching
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
        ? DecoratedBox(
            key: const ValueKey('active-account-check'),
            decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
            child: SizedBox.square(
              dimension: 22,
              child: Icon(
                LucideIcons.check,
                size: 13,
                color: c.primaryForeground,
              ),
            ),
          )
        : signInRequired
        ? AppButton.outline(
            key: const ValueKey('account-sign-in-again'),
            size: AppButtonSize.small,
            onPressed: tap,
            child: Text(l10n.authSignInAgain),
          )
        : Icon(AppIcons.forward, size: 16, color: c.mutedForeground);

    return Semantics(
      selected: active,
      button: tap != null,
      child: Material(
        color: c.card,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(
            color: active ? c.foreground : c.border,
            width: active ? 2 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: tap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 68),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.md,
              ),
              child: Row(
                children: [
                  AccountAvatar(
                    identity: identity,
                    isSelected: active,
                    size: 40,
                  ),
                  const SizedBox(width: AppSpacing.md + 2),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          identity.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: tokens.typography.ui.copyWith(
                            color: c.foreground,
                          ),
                        ),
                        if (status case (final text, final color))
                          Text(
                            text,
                            maxLines: 2,
                            style: tokens.typography.caption.copyWith(
                              color: color,
                            ),
                          )
                        else if (identity.email case final email?)
                          Text(
                            email,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.typography.caption.copyWith(
                              color: c.mutedForeground,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  trailing,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
