import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_format.dart';
import 'package:mobile/l10n/l10n.dart';

/// Quoted parent of a reply: sender and a one-line preview behind an
/// accent rule. [parent] is null when the original is not loaded.
class ChatReplyQuote extends StatelessWidget {
  const ChatReplyQuote({
    required this.parent,
    this.onTap,
    this.onPrimary = false,
    this.draft = false,
    super.key,
  });

  final ChatMessage? parent;
  final VoidCallback? onTap;

  /// Drawn inside a primary bubble, so it uses the on-primary colours.
  final bool onPrimary;

  /// Shown above the composer: "Replying to …".
  final bool draft;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final ink = onPrimary ? colors.primaryForeground : colors.foreground;
    final muted = onPrimary
        ? colors.primaryForeground.withValues(alpha: 0.75)
        : colors.mutedForeground;
    final rule = onPrimary
        ? colors.primaryForeground.withValues(alpha: 0.7)
        : colors.primary;
    final parent = this.parent;
    final sender = parent == null ? null : chatSenderName(context, parent);
    final title = parent == null
        ? l10n.chatOriginalUnavailable
        : draft
        ? l10n.chatReplyingTo(sender!)
        : sender!;
    final preview = parent == null ? null : chatMessagePreview(context, parent);
    final radius = BorderRadius.circular(AppRadius.xs);
    return Semantics(
      button: onTap != null,
      label: onTap == null ? null : l10n.chatJumpToOriginal,
      child: Material(
        color: onPrimary
            ? colors.primaryForeground.withValues(alpha: 0.12)
            : colors.muted.withValues(alpha: 0.7),
        borderRadius: radius,
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              border: BorderDirectional(
                start: BorderSide(color: rule, width: 3),
              ),
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xs,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.typography.xSmall.copyWith(
                    color: parent == null ? muted : ink,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (preview != null && preview.isNotEmpty)
                  Text(
                    preview,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.xSmall.copyWith(color: muted),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
