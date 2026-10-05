import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

export 'package:mobile/features/assistant/local/assistant_remote_chat_actions.dart'
    show retryAssistantChat;

class AssistantChatFeedback extends StatelessWidget {
  const AssistantChatFeedback({required this.state, this.onRetry, super.key});
  final AssistantChatState state;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    if (state.status == AssistantChatStatus.error) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHigh,
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Row(
              children: [
                Icon(
                  Icons.error_outline_rounded,
                  color: Theme.of(context).colorScheme.error,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    context.l10n.assistantReplyFailed,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurface,
                      fontSize: 13,
                    ),
                  ),
                ),
                if (onRetry != null)
                  IconButton(
                    onPressed: onRetry,
                    tooltip: context.l10n.commonRetry,
                    color: Theme.of(context).colorScheme.onSurface,
                    icon: const Icon(Icons.refresh_rounded),
                  ),
              ],
            ),
          ),
        ),
      );
    }
    if (state.isBusy) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            const NovaLoadingIndicator(size: 20),
            const SizedBox(width: 8),
            Text(context.l10n.assistantThinkingStatus),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }
}
