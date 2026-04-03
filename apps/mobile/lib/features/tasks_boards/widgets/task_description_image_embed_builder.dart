import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_utils.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskDescriptionImageEmbedBuilder extends EmbedBuilder {
  const TaskDescriptionImageEmbedBuilder();

  @override
  String get key => BlockEmbed.imageType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final src = _imageSrcFromEmbedData(embedContext.node.value.data);
    if (src.trim().isEmpty) {
      return const SizedBox.shrink();
    }

    final resolved = resolveTaskDescriptionUrl(src);
    final headers = trustedAuthHeadersForUrl(resolved);
    final theme = shad.Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 300),
          child: Image.network(
            resolved,
            fit: BoxFit.cover,
            headers: headers,
            errorBuilder: (context2, e, _) => buildEmbedFallback(
              context,
              theme: theme,
              icon: Icons.broken_image_outlined,
              label: 'Image',
            ),
            loadingBuilder: (context, child, progress) {
              if (progress == null) return child;
              return Container(
                height: 120,
                color: theme.colorScheme.secondary.withValues(alpha: 0.25),
                alignment: Alignment.center,
                child: const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  String _imageSrcFromEmbedData(Object? data) {
    final raw = data as String? ?? '';
    final trimmed = raw.trim();
    if (!trimmed.startsWith('{')) {
      return trimmed;
    }

    try {
      final decoded = jsonDecode(trimmed);
      if (decoded is Map) {
        final src = decoded['src'];
        if (src is String && src.trim().isNotEmpty) {
          return src.trim();
        }
      }
    } on FormatException {
      // Fall back to raw string.
    }

    return trimmed;
  }
}
