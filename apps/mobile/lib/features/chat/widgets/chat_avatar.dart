import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_format.dart';

/// Round avatar for a person: their photo, else initials on a muted disc.
class ChatPersonAvatar extends StatelessWidget {
  const ChatPersonAvatar({
    required this.name,
    this.avatarUrl,
    this.size = 32,
    super.key,
  });

  final String name;
  final String? avatarUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: size,
        child: NetworkAvatar(
          avatarUrl: avatarUrl,
          radius: size / 2,
          backgroundColor: colors.muted,
          child: Text(
            chatInitials(name),
            style: tokens.typography.xSmall.copyWith(
              color: colors.mutedForeground,
              fontWeight: FontWeight.w700,
              fontSize: size * 0.36,
            ),
          ),
        ),
      ),
    );
  }
}

/// Avatar for a message sender; the assistant gets the Mira mark.
class ChatSenderAvatar extends StatelessWidget {
  const ChatSenderAvatar({required this.message, this.size = 32, super.key});

  final ChatMessage message;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (message.kind == ChatMessageKind.assistant) {
      return AppIconTile(
        icon: LucideIcons.sparkles,
        tone: AppTone.primary,
        size: size,
      );
    }
    return ChatPersonAvatar(
      name: chatSenderName(context, message),
      avatarUrl: message.sender?.avatarUrl,
      size: size,
    );
  }
}

/// Leading visual of a conversation row: the other person in a direct
/// message, otherwise an icon for the conversation type.
class ChatConversationAvatar extends StatelessWidget {
  const ChatConversationAvatar({
    required this.conversation,
    required this.currentUserId,
    this.size = AppLayout.rowLeadingSize,
    super.key,
  });

  final ChatConversation conversation;
  final String? currentUserId;
  final double size;

  @override
  Widget build(BuildContext context) {
    return switch (conversation.type) {
      ChatConversationType.ai => AppIconTile(
        icon: LucideIcons.sparkles,
        tone: AppTone.primary,
        size: size,
      ),
      ChatConversationType.channel => AppIconTile(
        icon: LucideIcons.hash,
        size: size,
      ),
      ChatConversationType.group => AppIconTile(
        icon: LucideIcons.users,
        size: size,
      ),
      ChatConversationType.direct => _person(),
    };
  }

  Widget _person() {
    final others = conversation.members.where(
      (member) => member.userId != currentUserId,
    );
    final person = others.isEmpty
        ? (conversation.members.isEmpty ? null : conversation.members.first)
        : others.first;
    if (person == null) {
      return AppIconTile(icon: LucideIcons.user, size: size);
    }
    return ChatPersonAvatar(
      name: person.user.displayName,
      avatarUrl: person.user.avatarUrl,
      size: size,
    );
  }
}
