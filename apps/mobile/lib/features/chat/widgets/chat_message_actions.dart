import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_format.dart';
import 'package:mobile/features/chat/widgets/chat_reactions.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens the actions for [message]: quick reactions, reply, copy and, for
/// the viewer's own messages, delete.
Future<void> showChatMessageActions(
  BuildContext context, {
  required ChatMessage message,
  required ValueChanged<String> onReaction,
  VoidCallback? onReply,
  Future<void> Function()? onDelete,
}) {
  final l10n = context.l10n;
  return showAppSheet<void>(
    context: context,
    builder: (sheetContext) {
      void close() => Navigator.of(sheetContext).pop();
      final preview = chatMessagePreview(sheetContext, message);
      return AppSheetScaffold(
        title: chatSenderName(sheetContext, message),
        description: preview.isEmpty ? null : preview,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final emoji in chatQuickReactions)
                  _QuickReaction(
                    key: ValueKey('chat-quick-reaction-$emoji'),
                    emoji: emoji,
                    selected: message.reactions.any(
                      (reaction) => reaction.emoji == emoji,
                    ),
                    onTap: () {
                      close();
                      onReaction(emoji);
                    },
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            if (onReply != null)
              AppButton.ghost(
                leading: const Icon(LucideIcons.reply),
                onPressed: () {
                  close();
                  onReply();
                },
                child: Text(l10n.chatReply),
              ),
            if (message.content.trim().isNotEmpty)
              AppButton.ghost(
                leading: const Icon(LucideIcons.copy),
                onPressed: () {
                  close();
                  unawaited(
                    Clipboard.setData(ClipboardData(text: message.content)),
                  );
                  showAppToast(context, message: l10n.chatMessageCopied);
                },
                child: Text(l10n.chatCopyText),
              ),
            if (onDelete != null)
              AppButton.ghost(
                leading: const Icon(LucideIcons.trash2),
                onPressed: () {
                  close();
                  unawaited(_confirmDelete(context, onDelete));
                },
                child: Text(l10n.chatDeleteMessage),
              ),
          ],
        ),
      );
    },
  );
}

Future<void> _confirmDelete(
  BuildContext context,
  Future<void> Function() onDelete,
) async {
  final confirmed = await showAppDialog<bool>(
    context: context,
    builder: (dialogContext) => AppDialog(
      title: dialogContext.l10n.chatDeleteMessage,
      content: Text(dialogContext.l10n.chatDeleteMessageConfirm),
      actions: [
        AppButton.ghost(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: Text(dialogContext.l10n.commonCancel),
        ),
        AppButton.destructive(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: Text(dialogContext.l10n.commonDelete),
        ),
      ],
    ),
  );
  if (confirmed == true) await onDelete();
}

class _QuickReaction extends StatelessWidget {
  const _QuickReaction({
    required this.emoji,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final String emoji;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    return Semantics(
      button: true,
      label: context.l10n.chatReactWith(emoji),
      excludeSemantics: true,
      child: Material(
        color: selected
            ? colors.primary.withValues(alpha: colors.isDark ? 0.24 : 0.1)
            : colors.muted.withValues(alpha: 0.6),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox.square(
            dimension: 48,
            child: Center(
              child: Text(emoji, style: const TextStyle(fontSize: 22)),
            ),
          ),
        ),
      ),
    );
  }
}
