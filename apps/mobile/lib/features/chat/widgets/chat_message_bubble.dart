import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_attachment_preview.dart';
import 'package:mobile/features/chat/widgets/chat_avatar.dart';
import 'package:mobile/features/chat/widgets/chat_format.dart';
import 'package:mobile/features/chat/widgets/chat_message_reactions.dart';
import 'package:mobile/features/chat/widgets/chat_reply_quote.dart';
import 'package:mobile/features/chat/widgets/chat_thread_items.dart';
import 'package:mobile/l10n/l10n.dart';

/// Width of the avatar column beside other people's messages.
const double chatAvatarGutter = 32 + AppSpacing.sm;

/// One message in a thread. The viewer's messages sit on the end side in a
/// primary bubble; others' sit on the start side with an avatar and name on
/// the first message of a group. Long press (or secondary click) opens the
/// message actions.
class ChatMessageBubble extends StatelessWidget {
  const ChatMessageBubble({
    required this.item,
    required this.maxWidth,
    required this.currentUserId,
    required this.onReaction,
    this.showSenderName = true,
    this.hasReply = false,
    this.replyParent,
    this.onJumpToReply,
    this.onOpenActions,
    this.highlighted = false,
    super.key,
  });

  final ChatMessageItem item;
  final double maxWidth;
  final String? currentUserId;
  final ValueChanged<String> onReaction;
  final bool showSenderName;
  final bool hasReply;
  final ChatMessage? replyParent;
  final VoidCallback? onJumpToReply;
  final VoidCallback? onOpenActions;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final message = item.message;
    final mine = item.isMine;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final column = Column(
      crossAxisAlignment: mine
          ? CrossAxisAlignment.end
          : CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (item.startsGroup && !mine && showSenderName)
          Padding(
            padding: const EdgeInsets.only(
              left: AppSpacing.xs,
              bottom: AppSpacing.xxs,
            ),
            child: Text(
              chatSenderName(context, message),
              style: tokens.typography.xSmall.copyWith(
                color: colors.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        GestureDetector(
          onLongPress: onOpenActions,
          onSecondaryTap: onOpenActions,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: _Bubble(
              item: item,
              hasReply: hasReply,
              replyParent: replyParent,
              onJumpToReply: onJumpToReply,
              highlighted: highlighted,
            ),
          ),
        ),
        if (message.reactions.isNotEmpty && message.deletedAt == null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: ChatMessageReactions(
              reactions: message.reactions,
              currentUserId: currentUserId,
              onToggle: onReaction,
              onAdd: onOpenActions,
            ),
          ),
        if (item.endsGroup) _MessageMeta(message: message, mine: mine),
      ],
    );
    return Row(
      mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!mine)
          SizedBox(
            width: chatAvatarGutter,
            child: item.startsGroup
                ? Align(
                    alignment: AlignmentDirectional.topStart,
                    child: Padding(
                      padding: EdgeInsets.only(
                        top: showSenderName ? AppSpacing.lg : 0,
                      ),
                      child: ChatSenderAvatar(message: message),
                    ),
                  )
                : null,
          ),
        Flexible(child: column),
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.item,
    required this.hasReply,
    required this.replyParent,
    required this.onJumpToReply,
    required this.highlighted,
  });

  final ChatMessageItem item;
  final bool hasReply;
  final ChatMessage? replyParent;
  final VoidCallback? onJumpToReply;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final message = item.message;
    final mine = item.isMine;
    final deleted = message.deletedAt != null;
    final foreground = mine && !deleted
        ? colors.primaryForeground
        : colors.foreground;
    const round = Radius.circular(AppRadius.card - 4);
    const tight = Radius.circular(AppRadius.xs);
    final radius = BorderRadius.only(
      topLeft: !mine && !item.startsGroup ? tight : round,
      bottomLeft: !mine && !item.endsGroup ? tight : round,
      topRight: mine && !item.startsGroup ? tight : round,
      bottomRight: mine && !item.endsGroup ? tight : round,
    );
    final background = deleted
        ? Colors.transparent
        : mine
        ? colors.primary
        : colors.card;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 240),
      decoration: BoxDecoration(
        color: background,
        borderRadius: radius,
        border: Border.all(
          color: highlighted
              ? colors.ring
              : mine && !deleted
              ? Colors.transparent
              : colors.border,
          width: highlighted ? 2 : 1,
        ),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (hasReply && !deleted)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: ChatReplyQuote(
                parent: replyParent,
                onTap: onJumpToReply,
                onPrimary: mine,
              ),
            ),
          if (deleted)
            Text(
              context.l10n.chatMessageDeleted,
              style: tokens.typography.small.copyWith(
                color: colors.mutedForeground,
                fontStyle: FontStyle.italic,
              ),
            )
          else if (message.content.isNotEmpty)
            _MessageText(content: message.content, color: foreground),
          if (!deleted && message.attachments.isNotEmpty) ...[
            if (message.content.isNotEmpty)
              const SizedBox(height: AppSpacing.sm),
            for (final attachment in message.attachments)
              ChatAttachmentPreview(
                key: ValueKey(attachment.id),
                attachment: attachment,
                onPrimary: mine,
              ),
          ],
        ],
      ),
    );
  }
}

class _MessageText extends StatelessWidget {
  const _MessageText({required this.content, required this.color});

  final String content;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final body = tokens.typography.small.copyWith(
      color: color,
      height: 1.45,
      fontSize: 15,
    );
    return MarkdownBody(
      data: content,
      softLineBreak: true,
      styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
        p: body,
        listBullet: body,
        a: body.copyWith(decoration: TextDecoration.underline),
        code: body.copyWith(
          fontFamily: 'monospace',
          backgroundColor: color.withValues(alpha: 0.08),
        ),
        blockquoteDecoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: color.withValues(alpha: 0.4), width: 2),
          ),
        ),
      ),
      imageBuilder: (uri, title, alt) => Text(alt ?? ''),
      onTapLink: (text, href, title) {
        final uri = href == null ? null : Uri.tryParse(href);
        if (uri != null && (uri.scheme == 'https' || uri.scheme == 'http')) {
          unawaited(openMobileLink(context, uri));
        }
      },
    );
  }
}

class _MessageMeta extends StatelessWidget {
  const _MessageMeta({required this.message, required this.mine});

  final ChatMessage message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final at = message.createdAt;
    final parts = [
      if (at != null) chatClockTime(context, at),
      if (message.editedAt != null && message.deletedAt == null)
        context.l10n.chatEdited,
    ];
    if (parts.isEmpty) return const SizedBox(height: AppSpacing.xxs);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        AppSpacing.xs,
        AppSpacing.xs,
        0,
      ),
      child: Text(
        parts.join(' · '),
        style: tokens.typography.xSmall.copyWith(
          color: colors.mutedForeground,
          fontSize: 11,
        ),
      ),
    );
  }
}

/// Centred note for system events such as renames.
class ChatSystemMessage extends StatelessWidget {
  const ChatSystemMessage({required this.message, super.key});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: colors.muted.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        child: Text(
          message.content.isEmpty
              ? context.l10n.chatSystemEvent
              : message.content,
          textAlign: TextAlign.center,
          style: tokens.typography.xSmall.copyWith(
            color: colors.mutedForeground,
          ),
        ),
      ),
    );
  }
}
