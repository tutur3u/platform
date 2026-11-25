import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/assistant/widgets/mira_character/mira_character.dart';
import 'package:mobile/l10n/l10n.dart';

/// The greeting at the top of the new-chat screen: the animated Mira
/// character, a time-of-day line and the assistant's name.
class AssistantEmptyHero extends StatelessWidget {
  const AssistantEmptyHero({
    required this.assistantName,
    this.thinking = false,
    this.listening = false,
    this.now,
    this.characterSize = 104,
    super.key,
  });

  final String assistantName;

  /// Mira is loading the conversation.
  final bool thinking;
  final bool listening;

  /// Clock for the time-of-day line; defaults to the current time.
  final DateTime? now;
  final double characterSize;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final hour = (now ?? DateTime.now()).toLocal().hour;
    final timeOfDay = hour >= 5 && hour < 12
        ? l10n.tasksGoodMorning
        : hour >= 12 && hour < 17
        ? l10n.tasksGoodAfternoon
        : hour >= 17
        ? l10n.tasksGoodEvening
        : l10n.tasksGoodNight;
    return Padding(
      key: const ValueKey('assistant-empty-hero'),
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          MiraCharacter(
            size: characterSize,
            thinking: thinking,
            listening: listening,
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            timeOfDay,
            textAlign: TextAlign.center,
            style: tokens.typography.uiSm.copyWith(
              color: colors.mutedForeground,
            ),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            l10n.assistantEmptyGreeting(assistantName),
            textAlign: TextAlign.center,
            style: tokens.typography.h3.copyWith(color: colors.foreground),
          ),
        ],
      ),
    );
  }
}
