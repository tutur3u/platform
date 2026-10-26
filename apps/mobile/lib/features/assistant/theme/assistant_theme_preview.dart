import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_colors.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantThemePreview extends StatelessWidget {
  const AssistantThemePreview({required this.value, super.key});

  final AssistantThemePreferences value;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = AssistantThemeColors.resolve(value, tokens.brightness);
    Widget bubble(
      String text,
      AssistantMessageColors message, {
      required bool isUser,
    }) => Align(
      alignment: isUser
          ? AlignmentDirectional.centerEnd
          : AlignmentDirectional.centerStart,
      child: FractionallySizedBox(
        widthFactor: 0.88,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: message.background,
            borderRadius: tokens.borderRadiusLg,
          ),
          child: Text(
            text,
            style: tokens.typography.base.copyWith(color: message.foreground),
          ),
        ),
      ),
    );
    return Semantics(
      label: context.l10n.assistantThemePreview,
      child: ClipRRect(
        borderRadius: tokens.borderRadiusXl,
        child: DecoratedBox(
          decoration: colors.backgroundDecoration,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                bubble(
                  context.l10n.assistantThemePreviewUser,
                  colors.userMessage,
                  isUser: true,
                ),
                const SizedBox(height: AppSpacing.sm),
                bubble(
                  context.l10n.assistantThemePreviewAssistant,
                  colors.assistantMessage,
                  isUser: false,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
