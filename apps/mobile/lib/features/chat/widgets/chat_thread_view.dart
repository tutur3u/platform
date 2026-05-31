import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_composer.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    required this.onDetails,
    required this.onPin,
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
  final ValueChanged<PlatformFile> onPickAttachment;
  final ValueChanged<String> onRemoveAttachment;
  final void Function(ChatMessage message, String emoji) onReaction;
  final VoidCallback onDetails;
  final VoidCallback onPin;

  @override
  Widget build(BuildContext context) {
    final selected = conversation;
    if (selected == null) {
      return _NoConversationSelected();
    }

    return Column(
      children: [
        _ThreadHeader(
          conversation: selected,
          onDetails: onDetails,
          onPin: onPin,
        ),
        Expanded(
          child: switch (messageStatus) {
            ChatMessageStatus.loading => const NovaLoadingIndicator(size: 42),
            ChatMessageStatus.error => _ThreadEmpty(
              title: context.l10n.commonSomethingWentWrong,
              description: context.l10n.chatMessagesLoadError,
            ),
            _ => _MessageList(
              messages: messages,
              currentUserId: currentUserId,
              streamingAssistantText: streamingAssistantText,
              onReaction: onReaction,
            ),
          },
        ),
        ChatComposer(
          pendingAttachments: pendingAttachments,
          isSending: isSending,
          isUploadingAttachment: isUploadingAttachment,
          onSend: onSend,
          onPickAttachment: onPickAttachment,
          onRemoveAttachment: onRemoveAttachment,
        ),
      ],
    );
  }
}

class _ThreadHeader extends StatelessWidget {
  const _ThreadHeader({
    required this.conversation,
    required this.onDetails,
    required this.onPin,
  });

  final ChatConversation conversation;
  final VoidCallback onDetails;
  final VoidCallback onPin;

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.background,
        border: Border(bottom: BorderSide(color: colorScheme.border)),
      ),
      child: SafeArea(
        top: false,
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
          child: Row(
            children: [
              Icon(_iconFor(conversation.type), size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.displayTitle(
                        fallback: context.l10n.chatUntitled,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      context.l10n.chatMembersCount(conversation.memberCount),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              Tooltip(
                message: context.l10n.chatPinned,
                child: shad.IconButton.ghost(
                  icon: Icon(
                    conversation.isPinned
                        ? shad.LucideIcons.pinOff
                        : shad.LucideIcons.pin,
                    size: 18,
                  ),
                  onPressed: onPin,
                ),
              ),
              Tooltip(
                message: context.l10n.chatDetails,
                child: shad.IconButton.ghost(
                  icon: const Icon(shad.LucideIcons.panelRight, size: 18),
                  onPressed: onDetails,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _iconFor(ChatConversationType type) {
    return switch (type) {
      ChatConversationType.ai => shad.LucideIcons.bot,
      ChatConversationType.channel => shad.LucideIcons.hash,
      ChatConversationType.direct => shad.LucideIcons.user,
      ChatConversationType.group => shad.LucideIcons.users,
    };
  }
}
