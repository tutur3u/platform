import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_chat_feedback.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_receipt.dart';
import 'package:mobile/features/assistant/widgets/assistant_reply_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantTranscriptSection extends StatelessWidget {
  const AssistantTranscriptSection({
    required this.chatState,
    required this.liveState,
    required this.assistantName,
    this.onRetry,
    this.actorId,
    this.canPersistMessage,
    this.needsReactionRefresh,
    this.isActionCurrent,
    this.onReply,
    this.onReact,
    this.onRefreshReactions,
    super.key,
  });

  final AssistantChatState chatState;
  final AssistantLiveState liveState;
  final String assistantName;
  final VoidCallback? onRetry;
  final String? actorId;
  final bool Function(String)? canPersistMessage;
  final bool Function(String)? needsReactionRefresh;
  final bool Function()? isActionCurrent;
  final ValueChanged<String>? onReply;
  final void Function(String, String)? onReact;
  final ValueChanged<String>? onRefreshReactions;

  @override
  Widget build(BuildContext context) {
    final activeMessageId =
        chatState.status == AssistantChatStatus.streaming &&
            chatState.messages.isNotEmpty &&
            chatState.messages.last.role == 'assistant'
        ? chatState.messages.last.id
        : null;
    final hasThinkingPanel =
        activeMessageId != null &&
        chatState.messages.last.parts.any(
          (part) =>
              part.type == 'reasoning' &&
              (part.text?.trim().isNotEmpty ?? false),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...chatState.messages.indexed.map((entry) {
          final (index, message) = entry;
          final toolParts = _messageToolParts(message);
          final persisted = canPersistMessage?.call(message.id) ?? false;
          final refreshRequired =
              needsReactionRefresh?.call(message.id) ??
              message.reactionRefreshRequired;
          final reply = chatState.messages
              .where((candidate) => candidate.id == message.replyToMessageId)
              .firstOrNull;
          return Padding(
            key: ValueKey((
              'assistant-turn',
              chatState.workspaceId,
              chatState.chat?.id ?? chatState.fallbackChatId,
              message.clientRequestId ?? message.id,
            )),
            padding: const EdgeInsets.only(bottom: 14),
            child: AssistantTranscriptBubble(
              reactions: message.reactions,
              actorId: actorId,
              isActionCurrent: isActionCurrent,
              onReply: persisted && onReply != null
                  ? () => onReply!(message.id)
                  : null,
              onReact: persisted && !refreshRequired && onReact != null
                  ? (reaction) => onReact!(message.id, reaction)
                  : null,
              onRefreshReactions:
                  persisted && refreshRequired && onRefreshReactions != null
                  ? () => onRefreshReactions!(message.id)
                  : null,
              replyPreview: message.replyToMessageId == null
                  ? null
                  : AssistantReplyPreview(
                      label: context.l10n.assistantReplyMessageAction,
                      text: reply == null
                          ? context.l10n.assistantReplyUnavailable
                          : _messageText(reply),
                    ),
              activityActive: message.id == activeMessageId,
              label: message.role == 'user'
                  ? context.l10n.assistantYouLabel
                  : assistantName,
              alignEnd: message.role == 'user',
              text: _messageText(message),
              transcript: _messageTranscript(message),
              attachments:
                  chatState.attachmentsByMessageId[message.id] ?? const [],
              receipt: assistantMessageReceiptStatus(chatState.messages, index),
              timestamp: message.role == 'user' ? message.createdAt : null,
              toolParts: toolParts,
              orderedParts: message.role == 'user' ? const [] : message.parts,
              toolNames: toolParts.isEmpty
                  ? message.parts
                        .where((part) => part.type == 'dynamic-tool')
                        .map(
                          (part) =>
                              part.toolName ?? context.l10n.assistantToolLabel,
                        )
                        .toList(growable: false)
                  : const [],
            ),
          );
        }),
        if (!hasThinkingPanel)
          AssistantChatFeedback(state: chatState, onRetry: onRetry),
        if (liveState.userDraft.isNotEmpty ||
            liveState.userTranscript.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: AssistantTranscriptBubble(
              label: context.l10n.assistantLiveDraftUser,
              alignEnd: true,
              text: liveState.userDraft,
              transcript: liveState.userTranscript,
              attachments: const [],
              timestamp: null,
              toolNames: const [],
              isDraft: true,
            ),
          ),
        if (liveState.assistantDraft.isNotEmpty ||
            liveState.assistantTranscript.isNotEmpty ||
            liveState.assistantParts.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: AssistantTranscriptBubble(
              orderedParts: liveState.assistantParts,
              label: context.l10n.assistantLiveDraftAssistant,
              alignEnd: false,
              text: liveState.assistantDraft,
              transcript: liveState.assistantTranscript,
              attachments: const [],
              timestamp: null,
              toolNames: liveState.insightCards
                  .map((card) => card.title)
                  .toList(growable: false),
              isDraft: true,
            ),
          ),
      ],
    );
  }
}

String _messageText(AssistantMessage message) {
  return message.parts
      .where((part) => part.type == 'text')
      .map((part) => part.text ?? '')
      .join('\n\n')
      .trim();
}

String _messageTranscript(AssistantMessage message) {
  for (final part in message.parts) {
    if (part.type == 'reasoning' && (part.text?.trim().isNotEmpty ?? false)) {
      return part.text!.trim();
    }
  }
  return '';
}

List<AssistantMessagePart> _messageToolParts(AssistantMessage message) {
  return message.parts
      .where((part) => part.type == 'dynamic-tool')
      .toList(growable: false);
}
