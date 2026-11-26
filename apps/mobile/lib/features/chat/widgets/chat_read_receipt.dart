import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_avatar.dart';
import 'package:mobile/l10n/l10n.dart';

/// Who has read the viewer's newest message, when it is the newest message
/// in the thread: members other than the viewer whose read cursor is at or
/// after it. Null when nobody has, the message is not on the server yet,
/// or the conversation is with the assistant.
({String messageId, List<ChatUserProfile> readers})? chatSeenReceipt(
  ChatConversation conversation,
  List<ChatMessage> messages, {
  required String? currentUserId,
  required bool Function(ChatMessage message) isSynced,
}) {
  if (currentUserId == null || conversation.type == ChatConversationType.ai) {
    return null;
  }
  ChatMessage? latest;
  for (final message in messages.reversed) {
    if (message.kind != ChatMessageKind.system) {
      latest = message;
      break;
    }
  }
  final sentAt = latest?.createdAt;
  if (latest == null ||
      sentAt == null ||
      latest.senderId != currentUserId ||
      latest.deletedAt != null ||
      !isSynced(latest)) {
    return null;
  }
  final readers = [
    for (final member in conversation.members)
      if (member.userId != currentUserId &&
          member.lastReadAt != null &&
          !member.lastReadAt!.isBefore(sentAt))
        member.user,
  ];
  if (readers.isEmpty) return null;
  return (messageId: latest.id, readers: readers);
}

/// "Seen" in a direct conversation, "Seen by N" elsewhere, with the
/// readers' avatars.
class ChatReadReceipt extends StatelessWidget {
  const ChatReadReceipt({
    required this.readers,
    required this.direct,
    super.key,
  });

  static const _avatar = 16.0;
  static const _shown = 3;

  final List<ChatUserProfile> readers;
  final bool direct;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final shown = readers.take(_shown).toList(growable: false);
    final names = readers
        .map((reader) => _nameOf(reader, l10n.chatUnknownSender))
        .join(', ');
    return Semantics(
      container: true,
      label: l10n.chatSeenByNames(names),
      child: ExcludeSemantics(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xs,
            AppSpacing.xxs,
            AppSpacing.xs,
            0,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            spacing: AppSpacing.xs,
            children: [
              SizedBox(
                width: _avatar + (shown.length - 1) * (_avatar * 0.6),
                height: _avatar,
                child: Stack(
                  children: [
                    for (var index = 0; index < shown.length; index++)
                      Positioned(
                        left: index * _avatar * 0.6,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: colors.background,
                              width: 1.5,
                            ),
                          ),
                          child: ChatPersonAvatar(
                            name: _nameOf(shown[index], l10n.chatUnknownSender),
                            avatarUrl: shown[index].avatarUrl,
                            size: _avatar - 3,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Text(
                direct ? l10n.chatSeen : l10n.chatSeenByCount(readers.length),
                style: tokens.typography.xSmall.copyWith(
                  color: colors.mutedForeground,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _nameOf(ChatUserProfile user, String fallback) {
  final name = user.displayName.trim();
  return name.isEmpty ? fallback : name;
}
