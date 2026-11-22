import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/auth_section_card.dart';
import 'package:mobile/l10n/l10n.dart';

class ForgotPasswordPage extends StatelessWidget {
  const ForgotPasswordPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;

    return AuthScaffold(
      showBackButton: true,
      backButtonLabel: l10n.navBack,
      illustration: AppIllustrationKind.locked,
      title: l10n.forgotPasswordTitle,
      subtitle: Text(l10n.forgotPasswordDescription),
      bottomAction: AuthPrimaryButton(
        label: l10n.forgotPasswordBackToLogin,
        onPressed: () => context.go('/login'),
      ),
      child: AuthSectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const AppIconTile(
                  icon: LucideIcons.monitorSmartphone,
                  tone: AppTone.info,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    l10n.forgotPasswordInstructions,
                    style: tokens.typography.bodySm.copyWith(
                      color: c.mutedForeground,
                    ),
                  ),
                ),
              ],
            ),
            const AppGap(AppSpacing.md),
            Text(
              l10n.forgotPasswordNote,
              style: tokens.typography.uiSm.copyWith(color: c.foreground),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
