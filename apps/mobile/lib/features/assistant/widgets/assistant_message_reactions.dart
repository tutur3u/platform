import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_actions.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantMessageReactions extends StatelessWidget {
  const AssistantMessageReactions({
    required this.reactions,
    required this.actorId,
    this.onReact,
    super.key,
  });

  final List<ChatReactionSummary> reactions;
  final String? actorId;
  final ValueChanged<String>? onReact;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 4,
    runSpacing: 4,
    children: [
      for (final summary in reactions.where((item) => item.count > 0))
        Builder(
          builder: (context) {
            final reaction = AssistantReaction.parse(summary.emoji);
            final selected = summary.userIds.contains(actorId);
            final label =
                reaction?.label(context.l10n) ??
                context.l10n.assistantReactionLabel;
            return Semantics(
              selected: selected,
              child: AppButton.ghost(
                key: ValueKey('assistant-reaction-${summary.emoji}'),
                onPressed: onReact == null
                    ? null
                    : () => onReact!(summary.emoji),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(reaction?.icon ?? LucideIcons.smile, size: 16),
                    const SizedBox(width: 6),
                    Text(
                      '$label ${summary.count}',
                      style: TextStyle(
                        fontWeight: selected ? FontWeight.w700 : null,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
    ],
  );
}
