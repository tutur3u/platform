import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/tiptap_description_parser.dart';
import 'package:mobile/core/widgets/network_avatar.dart';

/// Renders mention atoms as the web's mention chips: a pill tinted by the
/// entity's colour, with its avatar or icon and its `@` or `#` prefix.
class DocumentMentionEmbedBuilder extends EmbedBuilder {
  const DocumentMentionEmbedBuilder();

  @override
  String get key => 'mention';

  @override
  bool get expanded => false;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final data = embedContext.node.value.data;
    TipTapMention? mention;
    if (data is String && data.isNotEmpty) {
      try {
        final attrs = jsonDecode(data);
        if (attrs is Map<String, dynamic>) {
          mention = tipTapMentionFromAttrs(attrs);
        }
      } on FormatException {
        // Shown as a plain mention below.
      }
    }
    return DocumentMentionChip(
      mention: mention,
      textStyle: embedContext.textStyle,
    );
  }
}

/// One mention chip.
class DocumentMentionChip extends StatelessWidget {
  const DocumentMentionChip({required this.mention, this.textStyle, super.key});

  final TipTapMention? mention;
  final TextStyle? textStyle;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = context.dynamicColors;
    final type = mention?.entityType ?? 'user';
    final (hue, icon, prefix) = switch (type) {
      'workspace' => (colors.orange, LucideIcons.briefcaseBusiness, '@'),
      'project' => (colors.cyan, LucideIcons.box, '@'),
      'task' => (colors.blue, LucideIcons.circleCheck, '#'),
      'date' => (colors.pink, LucideIcons.calendar, '@'),
      _ => (colors.green, LucideIcons.user, '@'),
    };
    final avatar = mention?.avatarUrl;
    final name = mention?.displayName ?? 'mention';
    final style = (textStyle ?? tokens.typography.small).copyWith(
      color: hue,
      fontWeight: FontWeight.w600,
    );
    return Semantics(
      label: '$prefix$name',
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 1),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(
          color: hue.withValues(alpha: 0.1),
          border: Border.all(color: hue.withValues(alpha: 0.4)),
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (avatar != null && avatar.trim().isNotEmpty)
              NetworkAvatar(
                avatarUrl: avatar,
                radius: 8,
                backgroundColor: hue.withValues(alpha: 0.2),
                child: Icon(icon, size: 10, color: hue),
              )
            else
              Icon(icon, size: 12, color: hue),
            const SizedBox(width: 4),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.sizeOf(context).width * 0.5,
              ),
              child: Text(
                '$prefix$name',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: style,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
