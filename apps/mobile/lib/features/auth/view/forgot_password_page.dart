import 'package:flutter/material.dart'
    hide AppBar, FilledButton, Scaffold, TextField;
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile/features/auth/widgets/auth_action_button.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';
import 'package:mobile/features/auth/widgets/auth_section_card.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ForgotPasswordPage extends StatelessWidget {
  const ForgotPasswordPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return AuthScaffold(
      showBackButton: true,
      title: l10n.forgotPasswordTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.forgotPasswordDescription,
            style: theme.typography.textMuted.copyWith(fontSize: 16),
            textAlign: TextAlign.center,
          ),
          const shad.Gap(24),
          AuthSectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withValues(
                          alpha: 0.12,
                        ),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        LucideIcons.monitorSmartphone,
                        size: 20,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    const shad.Gap(12),
                    Expanded(
                      child: Text(
                        l10n.forgotPasswordInstructions,
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ],
                ),
                const shad.Gap(16),
                Text(
                  l10n.forgotPasswordNote,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.foreground,
                    fontWeight: FontWeight.w600,
                    height: 1.4,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          const shad.Gap(24),
          AuthPrimaryButton(
            label: l10n.forgotPasswordBackToLogin,
            onPressed: () => context.go('/login'),
          ),
        ],
      ),
    );
  }
}
