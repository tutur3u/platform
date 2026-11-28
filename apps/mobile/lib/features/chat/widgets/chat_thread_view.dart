import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_link_preview_store.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_ai_consent.dart';
import 'package:mobile/features/chat/widgets/chat_avatar.dart';
import 'package:mobile/features/chat/widgets/chat_composer.dart';
import 'package:mobile/features/chat/widgets/chat_format.dart';
import 'package:mobile/features/chat/widgets/chat_link_previews.dart';
import 'package:mobile/features/chat/widgets/chat_message_actions.dart';
import 'package:mobile/features/chat/widgets/chat_message_bubble.dart';
import 'package:mobile/features/chat/widgets/chat_read_receipt.dart';
import 'package:mobile/features/chat/widgets/chat_thread_items.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

part 'chat_thread_message_list.dart';
part 'chat_thread_attachments.dart';

class ChatThreadView extends StatelessWidget {
  const ChatThreadView({
    required this.conversation,
    required this.messages,
    required this.messageStatus,
    required this.currentUserId,
    required this.pendingAttachments,
    required this.streamingAssistantText,
    required this.isSending,
    required this.isUploadingAttachment,
    required this.onSend,
    required this.onPickAttachment,
    required this.onRemoveAttachment,
    required this.onReaction,
    this.replyTo,
    this.onReply,
    this.onCancelReply,
    this.onTypingChanged,
    this.onTypingStopped,
    this.onDeleteMessage,
    this.typingNames = const [],
    this.hasOlderMessages = false,
    this.isLoadingOlderMessages = false,
    this.onLoadOlderMessages,
    this.onRetry,
    this.isMessageSynced,
    this.linkPreviews,
    this.canDeleteOthers = false,
    this.onSafetyAction,
    this.composerBlocked = false,
    this.heldDraft,
    this.onHeldDraftTaken,
    super.key,
  });

  final ChatConversation? conversation;
  final List<ChatMessage> messages;
  final String? currentUserId;
  final ChatMessageStatus messageStatus;
  final List<ChatAttachment> pendingAttachments;
  final String streamingAssistantText;
  final bool isSending;
  final bool isUploadingAttachment;
  final ValueChanged<String> onSend;
  final Future<void> Function(PlatformFile) onPickAttachment;
  final ValueChanged<String> onRemoveAttachment;
  final void Function(ChatMessage message, String emoji) onReaction;

  /// Message the composer is answering.
  final ChatMessage? replyTo;
  final ValueChanged<ChatMessage>? onReply;
  final VoidCallback? onCancelReply;
  final ValueChanged<String>? onTypingChanged;
  final VoidCallback? onTypingStopped;
  final Future<void> Function(ChatMessage message)? onDeleteMessage;

  /// Display names of people typing in this conversation.
  final List<String> typingNames;
  final bool hasOlderMessages;
  final bool isLoadingOlderMessages;
  final VoidCallback? onLoadOlderMessages;
  final VoidCallback? onRetry;

  /// Whether a message is on the server and can take replies, reactions
  /// and deletion. Defaults to "not waiting in the offline queue".
  final bool Function(String messageId)? isMessageSynced;

  /// Resolves link previews for synced messages; none are shown without it.
  final ChatLinkPreviewStore? linkPreviews;

  /// Whether the viewer moderates this conversation and may delete other
  /// members' messages.
  final bool canDeleteOthers;

  /// Reports a message or its sender, or blocks the sender; offered only on
  /// other people's messages.
  final void Function(ChatMessage message, ChatSafetyAction action)?
  onSafetyAction;

  /// Whether this direct conversation is blocked either way, which replaces
  /// the composer with an explanation.
  final bool composerBlocked;

  /// Text of a send the server refused for missing AI consent, handed back
  /// to the composer; [onHeldDraftTaken] reports that it was taken.
  final String? heldDraft;
  final VoidCallback? onHeldDraftTaken;

  @override
  Widget build(BuildContext context) {
    final selected = conversation;
    if (selected == null) return const ChatNoConversationSelected();

    return Column(
      children: [
        Expanded(
          child: selected.isReadOnlyAgent
              ? SingleChildScrollView(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Text(
                    selected.latestMessage?.content ??
                        selected.description ??
                        '',
                    style: AppTokens.of(context).typography.body,
                  ),
                )
              : switch (messageStatus) {
                  ChatMessageStatus.loading => const _ThreadSkeleton(),
                  ChatMessageStatus.error => _ThreadEmpty(
                    title: context.l10n.commonSomethingWentWrong,
                    description: context.l10n.chatMessagesLoadError,
                    icon: AppIcons.error,
                    tone: AppTone.destructive,
                    actionLabel: onRetry == null
                        ? null
                        : context.l10n.chatRetry,
                    onAction: onRetry,
                  ),
                  _ => _MessageList(
                    conversation: selected,
                    messages: messages,
                    currentUserId: currentUserId,
                    streamingAssistantText: streamingAssistantText,
                    onReaction: onReaction,
                    onReply: onReply,
                    onDeleteMessage: onDeleteMessage,
                    hasOlderMessages: hasOlderMessages,
                    isLoadingOlderMessages: isLoadingOlderMessages,
                    onLoadOlderMessages: onLoadOlderMessages,
                    isMessageSynced:
                        isMessageSynced ??
                        (id) => !isPendingChatMessage(selected.wsId, id),
                    linkPreviews: linkPreviews,
                    canDeleteOthers: canDeleteOthers,
                    onSafetyAction: onSafetyAction,
                  ),
                },
        ),
        if (typingNames.isNotEmpty) _TypingLine(names: typingNames),
        if (!selected.isReadOnlyAgent && composerBlocked)
          const _BlockedComposerNotice()
        else if (!selected.isReadOnlyAgent)
          ChatComposer(
            pendingAttachments: pendingAttachments,
            isSending: isSending,
            isUploadingAttachment: isUploadingAttachment,
            onSend: onSend,
            onPickAttachment: onPickAttachment,
            onRemoveAttachment: onRemoveAttachment,
            replyTo: replyTo,
            onCancelReply: onCancelReply,
            onTypingChanged: onTypingChanged,
            onTypingStopped: onTypingStopped,
            // Mira replies in AI conversations come from Google Gemini.
            beforeSend: selected.type == ChatConversationType.ai
                ? () => ensureChatAiConsent(context)
                : null,
            restoreDraft: heldDraft,
            onDraftRestored: () {
              onHeldDraftTaken?.call();
              if (context.mounted) askChatAiConsentAgain(context);
            },
          ),
      ],
    );
  }
}

/// Shown in place of the composer when the person cannot be messaged.
class _BlockedComposerNotice extends StatelessWidget {
  const _BlockedComposerNotice();

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      key: const ValueKey('chat-composer-blocked'),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.xs,
        AppSpacing.md,
        AppSpacing.sm,
      ),
      child: Semantics(
        liveRegion: true,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: tokens.colorScheme.muted,
            borderRadius: BorderRadius.circular(AppRadius.card - 4),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Row(
              children: [
                Icon(
                  LucideIcons.ban,
                  size: 18,
                  color: tokens.colorScheme.mutedForeground,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    context.l10n.chatSafetyCannotMessage,
                    style: tokens.typography.small.copyWith(
                      color: tokens.colorScheme.mutedForeground,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TypingLine extends StatelessWidget {
  const _TypingLine({required this.names});

  final List<String> names;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;
    final label = names.length == 1
        ? l10n.chatTypingOne(names.first)
        : l10n.chatTypingMany(names.length);
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          0,
          AppSpacing.lg,
          AppSpacing.xs,
        ),
        child: Align(
          alignment: AlignmentDirectional.centerStart,
          child: Text(
            label,
            style: tokens.typography.xSmall.copyWith(
              color: tokens.colorScheme.mutedForeground,
              fontStyle: FontStyle.italic,
            ),
          ),
        ),
      ),
    );
  }
}
