import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/assistant/widgets/assistant_empty_hero.dart';
import 'package:mobile/features/assistant/widgets/assistant_quick_actions.dart';

/// The new-chat screen: greeting, quick actions and, when given, the recent
/// conversations, centred in the space above the composer.
class AssistantHomeView extends StatelessWidget {
  const AssistantHomeView({
    required this.assistantName,
    required this.onPromptSelected,
    this.recent,
    this.thinking = false,
    this.listening = false,
    this.now,
    super.key,
  });

  /// Widest the home content grows, so tiles stay readable on desktop.
  static const double maxWidth = 640;

  final String assistantName;
  final ValueChanged<String> onPromptSelected;

  /// Recent conversations; null where the history sidebar already shows them.
  final Widget? recent;
  final bool thinking;
  final bool listening;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final compactHeight = MediaQuery.sizeOf(context).height < 700;
    return Center(
      key: const ValueKey('assistant-home'),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: maxWidth),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AssistantEmptyHero(
                assistantName: assistantName,
                thinking: thinking,
                listening: listening,
                now: now,
                characterSize: compactHeight ? 80 : 104,
              ),
              const SizedBox(height: AppSpacing.xl),
              AssistantQuickActionGrid(onSelected: onPromptSelected),
              if (recent case final recent?) ...[
                const SizedBox(height: AppSpacing.xxl),
                recent,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
