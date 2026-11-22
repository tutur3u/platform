import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_error_notice.dart';
import 'package:mobile/l10n/l10n.dart';

/// The authenticator setup key on the phone: selectable, copyable, and, when
/// the enrol response gave an `otpauth://` link, handed straight to an
/// authenticator app. A QR would point the phone at itself, so there is none.
class RequiredMfaSecretCard extends StatelessWidget {
  const RequiredMfaSecretCard({
    required this.secret,
    required this.canOpenAuthenticator,
    required this.openFailed,
    required this.onCopy,
    required this.onOpenAuthenticator,
    super.key,
  });

  final String secret;
  final bool canOpenAuthenticator;
  final bool openFailed;
  final VoidCallback onCopy;
  final VoidCallback onOpenAuthenticator;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.requiredMfaSecretLabel,
            style: tokens.typography.bodySm.copyWith(color: c.mutedForeground),
          ),
          const AppGap(AppSpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: c.muted,
              borderRadius: BorderRadius.circular(AppRadius.sm),
            ),
            child: SelectableText(
              secret,
              key: const ValueKey('required-mfa-secret'),
              style: tokens.typography.base.copyWith(
                fontFamily: tokens.typography.monoFamily,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.2,
                color: c.foreground,
              ),
            ),
          ),
          const AppGap(AppSpacing.md),
          if (canOpenAuthenticator) ...[
            AuthPrimaryButton(
              label: l10n.requiredMfaOpenAuthenticator,
              leading: const Icon(LucideIcons.externalLink, size: 18),
              onPressed: onOpenAuthenticator,
            ),
            const AppGap(AppSpacing.sm),
          ],
          AuthSecondaryButton(
            label: l10n.requiredMfaCopySecret,
            leading: const Icon(LucideIcons.copy, size: 18),
            onPressed: onCopy,
          ),
          if (openFailed) ...[
            const AppGap(AppSpacing.sm),
            AuthInlineError(l10n.requiredMfaOpenFailed),
          ],
        ],
      ),
    );
  }
}
