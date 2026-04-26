import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_utils.dart';
import 'package:mobile/l10n/l10n.dart';
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

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: _TaskDescriptionImagePreview(
        url: resolved,
        headers: headers,
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

class _TaskDescriptionImagePreview extends StatelessWidget {
  const _TaskDescriptionImagePreview({
    required this.url,
    this.headers,
  });

  final String url;
  final Map<String, String>? headers;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final heroTag = 'task-description-image-$url';

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 300),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => _openFullscreen(context, heroTag),
              child: Hero(
                tag: heroTag,
                child: Image.network(
                  url,
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
                      color: theme.colorScheme.secondary.withValues(
                        alpha: 0.25,
                      ),
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
          ),
          Positioned(
            right: 8,
            bottom: 8,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.58),
                borderRadius: BorderRadius.circular(999),
              ),
              child: IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: context.l10n.assistantEnterFullscreenAction,
                onPressed: () => _openFullscreen(context, heroTag),
                icon: const Icon(
                  Icons.open_in_full_rounded,
                  color: Colors.white,
                  size: 18,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _openFullscreen(BuildContext context, String heroTag) {
    unawaited(
      Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute<void>(
          fullscreenDialog: true,
          builder: (_) => _TaskDescriptionImageFullscreenPage(
            heroTag: heroTag,
            url: url,
            headers: headers,
          ),
        ),
      ),
    );
  }
}

class _TaskDescriptionImageFullscreenPage extends StatelessWidget {
  const _TaskDescriptionImageFullscreenPage({
    required this.heroTag,
    required this.url,
    this.headers,
  });

  final String heroTag;
  final String url;
  final Map<String, String>? headers;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Center(
            child: InteractiveViewer(
              minScale: 0.75,
              maxScale: 5,
              child: Hero(
                tag: heroTag,
                child: Image.network(
                  url,
                  fit: BoxFit.contain,
                  headers: headers,
                  errorBuilder: (context, error, stackTrace) {
                    return const Icon(
                      Icons.broken_image_outlined,
                      color: Colors.white70,
                      size: 44,
                    );
                  },
                ),
              ),
            ),
          ),
          SafeArea(
            bottom: false,
            child: Align(
              alignment: Alignment.topLeft,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.48),
                    shape: BoxShape.circle,
                  ),
                  child: IconButton(
                    tooltip: MaterialLocalizations.of(context).closeButtonLabel,
                    icon: const Icon(
                      Icons.close_rounded,
                      color: Colors.white,
                    ),
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
