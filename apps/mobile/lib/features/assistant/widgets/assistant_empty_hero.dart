import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/assistant/widgets/mira_character/mira_character.dart';
import 'package:mobile/l10n/l10n.dart';

/// The new-chat screen: the animated Mira character and a greeting, centred
/// in the space above the composer and its starter prompts.
class AssistantEmptyHero extends StatelessWidget {
  const AssistantEmptyHero({
    required this.assistantName,
    this.thinking = false,
    super.key,
  });

  final String assistantName;

  /// Mira is loading the conversation.
  final bool thinking;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Center(
      key: const ValueKey('assistant-empty-hero'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            MiraCharacter(size: 136, thinking: thinking),
            const SizedBox(height: AppSpacing.md),
            Text(
              context.l10n.assistantEmptyGreeting(assistantName),
              textAlign: TextAlign.center,
              style: tokens.typography.h3.copyWith(
                color: tokens.colorScheme.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
