import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Reaction pills under a message. The viewer's own reactions are tinted;
/// tapping a pill toggles it, and the trailing button opens the picker.
class ChatMessageReactions extends StatelessWidget {
  const ChatMessageReactions({
    required this.reactions,
    required this.currentUserId,
    this.onToggle,
    this.onAdd,
    super.key,
  });

  final List<ChatReactionSummary> reactions;
  final String? currentUserId;
  final ValueChanged<String>? onToggle;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final reaction in reactions)
          _ReactionPill(
            reaction: reaction,
            mine:
                currentUserId != null &&
                reaction.userIds.contains(currentUserId),
            onTap: onToggle == null ? null : () => onToggle!(reaction.emoji),
          ),
        if (onAdd != null)
          AppIconButton(
            tooltip: context.l10n.chatAddReaction,
            size: AppButtonSize.small,
            density: AppButtonDensity.iconDense,
            shape: AppButtonShape.circle,
            icon: const Icon(LucideIcons.smilePlus, size: 16),
            onPressed: onAdd,
          ),
      ],
    );
  }
}

class _ReactionPill extends StatelessWidget {
  const _ReactionPill({
    required this.reaction,
    required this.mine,
    required this.onTap,
  });

  final ChatReactionSummary reaction;
  final bool mine;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final radius = BorderRadius.circular(AppRadius.pill);
    return Semantics(
      button: true,
      enabled: onTap != null,
      toggled: mine,
      label: context.l10n.chatReactionSummary(reaction.emoji, reaction.count),
      onTap: onTap,
      excludeSemantics: true,
      child: Material(
        color: mine
            ? colors.primary.withValues(alpha: colors.isDark ? 0.24 : 0.1)
            : colors.card,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(
            color: mine
                ? colors.primary.withValues(alpha: 0.45)
                : colors.border,
          ),
        ),
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 28, minWidth: 44),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xxs,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(reaction.emoji, style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    '${reaction.count}',
                    style: tokens.typography.xSmall.copyWith(
                      color: mine ? colors.primary : colors.mutedForeground,
                      fontWeight: FontWeight.w700,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
