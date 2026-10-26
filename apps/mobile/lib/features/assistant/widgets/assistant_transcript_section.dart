import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_chat_feedback.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_receipt.dart';
import 'package:mobile/features/assistant/widgets/assistant_reply_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantTranscriptSection extends StatefulWidget {
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
    this.onJumpToReply,
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
  final VoidCallback? onJumpToReply;

  @override
  State<AssistantTranscriptSection> createState() =>
      _AssistantTranscriptSectionState();
}

class _AssistantTranscriptSectionState
    extends State<AssistantTranscriptSection> {
  final _messageKeys = <String, GlobalKey>{};
  final _turnKeys = <String, GlobalKey>{};
  (String?, String?, String?)? _scope;

  void _jumpTo(String messageId) {
    if (!(widget.isActionCurrent?.call() ?? true)) return;
    final target = _messageKeys[messageId]?.currentContext;
    if (target == null) return;
    widget.onJumpToReply?.call();
    Scrollable.ensureVisible(
      target,
      alignment: 0.15,
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 220),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scope = (
      widget.actorId,
      widget.chatState.workspaceId,
      widget.chatState.chat?.id ?? widget.chatState.fallbackChatId,
    );
    if (_scope != scope) {
      _scope = scope;
      _messageKeys.clear();
      _turnKeys.clear();
    }
    final messagesById = {
      for (final message in widget.chatState.messages) message.id: message,
    };
    final turnIds = widget.chatState.messages
        .map((message) => message.clientRequestId ?? message.id)
        .toSet();
    _turnKeys.removeWhere((id, _) => !turnIds.contains(id));
    _messageKeys.clear();
    for (final message in widget.chatState.messages) {
      final turn = message.clientRequestId ?? message.id;
      _messageKeys[message.id] = _turnKeys.putIfAbsent(turn, GlobalKey.new);
    }
    final activeMessageId =
        widget.chatState.status == AssistantChatStatus.streaming &&
            widget.chatState.messages.isNotEmpty &&
            widget.chatState.messages.last.role == 'assistant'
        ? widget.chatState.messages.last.id
        : null;
    final hasThinkingPanel =
        activeMessageId != null &&
        widget.chatState.messages.last.parts.any(
          (part) =>
              part.type == 'reasoning' &&
              (part.text?.trim().isNotEmpty ?? false),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...widget.chatState.messages.indexed.map((entry) {
          final (index, message) = entry;
          final toolParts = _messageToolParts(message);
          final persisted = widget.canPersistMessage?.call(message.id) ?? false;
          final refreshRequired =
              widget.needsReactionRefresh?.call(message.id) ??
              message.reactionRefreshRequired;
          final reply = messagesById[message.replyToMessageId];
          return KeyedSubtree(
            key: _messageKeys[message.id],
            child: Padding(
              key: ValueKey((
                'assistant-turn',
                widget.chatState.workspaceId,
                widget.chatState.chat?.id ?? widget.chatState.fallbackChatId,
                message.clientRequestId ?? message.id,
              )),
              padding: const EdgeInsets.only(bottom: 14),
              child: AssistantTranscriptBubble(
                reactions: message.reactions,
                actorId: widget.actorId,
                isActionCurrent: widget.isActionCurrent,
                onReply: persisted && widget.onReply != null
                    ? () => widget.onReply?.call(message.id)
                    : null,
                onReact: persisted && !refreshRequired && widget.onReact != null
                    ? (reaction) => widget.onReact!(message.id, reaction)
                    : null,
                onRefreshReactions:
                    persisted &&
                        refreshRequired &&
                        widget.onRefreshReactions != null
                    ? () => widget.onRefreshReactions!(message.id)
                    : null,
                replyPreview: message.replyToMessageId == null
                    ? null
                    : AssistantReplyPreview(
                        key: ValueKey('assistant-reply-target-${message.id}'),
                        onTap: reply == null ? null : () => _jumpTo(reply.id),
                        label: context.l10n.assistantReplyMessageAction,
                        text: reply == null
                            ? context.l10n.assistantReplyUnavailable
                            : _messageText(reply),
                      ),
                activityActive: message.id == activeMessageId,
                label: message.role == 'user'
                    ? context.l10n.assistantYouLabel
                    : widget.assistantName,
                alignEnd: message.role == 'user',
                text: _messageText(message),
                transcript: _messageTranscript(message),
                attachments:
                    widget.chatState.attachmentsByMessageId[message.id] ??
                    const [],
                receipt: assistantMessageReceiptStatus(
                  widget.chatState.messages,
                  index,
                ),
                timestamp: message.role == 'user' ? message.createdAt : null,
                toolParts: toolParts,
                orderedParts: message.role == 'user' ? const [] : message.parts,
                toolNames: toolParts.isEmpty
                    ? message.parts
                          .where((part) => part.type == 'dynamic-tool')
                          .map(
                            (part) =>
                                part.toolName ??
                                context.l10n.assistantToolLabel,
                          )
                          .toList(growable: false)
                    : const [],
              ),
            ),
          );
        }),
        if (!hasThinkingPanel)
          AssistantChatFeedback(
            state: widget.chatState,
            onRetry: widget.onRetry,
          ),
        if (widget.liveState.userDraft.isNotEmpty ||
            widget.liveState.userTranscript.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: AssistantTranscriptBubble(
              label: context.l10n.assistantLiveDraftUser,
              alignEnd: true,
              text: widget.liveState.userDraft,
              transcript: widget.liveState.userTranscript,
              attachments: const [],
              timestamp: null,
              toolNames: const [],
              isDraft: true,
            ),
          ),
        if (widget.liveState.assistantDraft.isNotEmpty ||
            widget.liveState.assistantTranscript.isNotEmpty ||
            widget.liveState.assistantParts.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: AssistantTranscriptBubble(
              orderedParts: widget.liveState.assistantParts,
              label: context.l10n.assistantLiveDraftAssistant,
              alignEnd: false,
              text: widget.liveState.assistantDraft,
              transcript: widget.liveState.assistantTranscript,
              attachments: const [],
              timestamp: null,
              toolNames: widget.liveState.insightCards
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
