import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/utils/tiptap_description_parser.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_utils.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskDescriptionMentionEmbedBuilder extends EmbedBuilder {
  const TaskDescriptionMentionEmbedBuilder();

  @override
  String get key => 'mention';

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final data = embedContext.node.value.data as String? ?? '';
    if (data.isEmpty) {
      return const Text('@mention');
    }

    try {
      final attrs = jsonDecode(data);
      if (attrs is! Map<String, dynamic>) {
        return const Text('@mention');
      }
      final mention = _mentionFromAttrs(attrs);
      if (mention == null) {
        return const Text('@mention');
      }
      return TaskDescriptionMentionChip(
        mention: mention,
        preferredStyle: embedContext.textStyle,
      );
    } on Object {
      return const Text('@mention');
    }
  }
}

class TaskDescriptionMentionChip extends StatelessWidget {
  const TaskDescriptionMentionChip({
    required this.mention,
    this.preferredStyle,
    super.key,
  });

  final TipTapMention mention;
  final TextStyle? preferredStyle;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colors = DynamicColors.of(context);
    final mentionBackground = colors.green.withValues(alpha: 0.2);
    final mentionBorder = colors.green;
    final mentionText = colors.lightGreen;
    final avatarUrl = mention.avatarUrl;
    final hasAvatar = avatarUrl != null && avatarUrl.trim().isNotEmpty;

    final tooltip = [
      if (mention.entityType != null) mention.entityType,
      if (mention.subtitle != null) mention.subtitle,
      if (mention.priority != null) mention.priority,
      if (mention.entityId != null) mention.entityId,
    ].whereType<String>().join(' | ');

    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: mentionBackground,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: mentionBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: mentionBorder, width: 0.8),
            ),
            child: ClipOval(
              child: hasAvatar
                  ? (() {
                      final resolvedAvatarUrl = resolveTaskDescriptionUrl(
                        avatarUrl,
                      );
                      return Image.network(
                        resolvedAvatarUrl,
                        fit: BoxFit.cover,
                        headers: trustedAuthHeadersForUrl(resolvedAvatarUrl),
                        errorBuilder: (context, error, stackTrace) => Icon(
                          Icons.person_outline,
                          size: 11,
                          color: mentionBorder,
                        ),
                      );
                    })()
                  : Icon(
                      Icons.person_outline,
                      size: 11,
                      color: mentionBorder,
                    ),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            '@${mention.displayName}',
            style:
                preferredStyle?.copyWith(
                  color: mentionText,
                  fontWeight: FontWeight.w600,
                ) ??
                theme.typography.small.copyWith(
                  color: mentionText,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );

    if (tooltip.isEmpty) {
      return chip;
    }

    return Tooltip(message: tooltip, child: chip);
  }
}

TipTapMention? _mentionFromAttrs(Map<String, dynamic> attrs) {
  String? str(String key) {
    final v = attrs[key];
    return v is String && v.trim().isNotEmpty ? v.trim() : null;
  }

  List<String>? strList(String key) {
    final v = attrs[key];
    if (v is! List) return null;
    final list = v
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList(growable: false);
    return list.isEmpty ? null : list;
  }

  final displayName =
      str('displayName') ??
      str('label') ??
      str('name') ??
      str('entityId') ??
      str('userId') ??
      str('id');

  if (displayName == null) return null;

  return TipTapMention(
    displayName: displayName,
    userId: str('userId'),
    entityId: str('entityId'),
    entityType: str('entityType'),
    avatarUrl: str('avatarUrl'),
    subtitle: str('subtitle'),
    priority: str('priority'),
    listColor: str('listColor'),
    assignees: strList('assignees'),
  );
}
