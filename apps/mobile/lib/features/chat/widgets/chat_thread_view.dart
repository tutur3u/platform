import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_attachment_preview.dart';
import 'package:mobile/features/chat/widgets/chat_composer.dart';
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

  @override
  Widget build(BuildContext context) {
    final selected = conversation;
    if (selected == null) {
      return const _NoConversationSelected();
    }

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
                  ChatMessageStatus.loading => const AppLoadingIndicator.page(),
                  ChatMessageStatus.error => _ThreadEmpty(
                    title: context.l10n.commonSomethingWentWrong,
                    description: context.l10n.chatMessagesLoadError,
                    icon: AppIcons.error,
                    tone: AppTone.destructive,
                  ),
                  _ => _MessageList(
                    workspaceId: selected.wsId,
                    messages: messages,
                    currentUserId: currentUserId,
                    streamingAssistantText: streamingAssistantText,
                    onReaction: onReaction,
                  ),
                },
        ),
        if (!selected.isReadOnlyAgent)
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
