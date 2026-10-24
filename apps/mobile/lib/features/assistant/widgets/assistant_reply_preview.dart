import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantReplyPreview extends StatelessWidget {
  const AssistantReplyPreview({
    required this.label,
    required this.text,
    this.onCancel,
    super.key,
  });

  final String label;
  final String text;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    return Container(
      key: const ValueKey('assistant-reply-preview'),
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      decoration: BoxDecoration(
        color: colors.muted.withValues(alpha: 0.6),
        border: BorderDirectional(
          start: BorderSide(color: colors.primary, width: 3),
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.reply, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: colors.foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  text,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: colors.mutedForeground),
                ),
              ],
            ),
          ),
          if (onCancel != null)
            AppIconButton(
              tooltip: context.l10n.commonCancel,
              icon: const Icon(LucideIcons.x),
              onPressed: onCancel,
            ),
        ],
      ),
    );
  }
}
