import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_utils.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskDescriptionImageEmbedBuilder extends EmbedBuilder {
  const TaskDescriptionImageEmbedBuilder();

  @override
  String get key => BlockEmbed.imageType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final image = _TaskDescriptionImageData.parse(embedContext.node.value.data);
    if (image == null) {
      return const SizedBox.shrink();
    }

    final resolved = resolveTaskDescriptionUrl(image.src);
    final headers = trustedAuthHeadersForUrl(resolved);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: _TaskDescriptionImagePreview(
        url: resolved,
        headers: headers,
        width: image.width,
        height: image.height,
      ),
    );
  }
}

/// An image embed's source and the display size the web stored, when it
/// stored one.
class _TaskDescriptionImageData {
  const _TaskDescriptionImageData({required this.src, this.width, this.height});

  /// Reads a bare URL or the JSON payload the converter writes for images
  /// with attributes.
  static _TaskDescriptionImageData? parse(Object? data) {
    final trimmed = (data is String ? data : '').trim();
    if (trimmed.isEmpty) return null;
    if (!trimmed.startsWith('{')) {
      return _TaskDescriptionImageData(src: trimmed);
    }

    try {
      final decoded = jsonDecode(trimmed);
      if (decoded is Map) {
        final src = decoded['src'];
        if (src is String && src.trim().isNotEmpty) {
          return _TaskDescriptionImageData(
            src: src.trim(),
            width: _dimension(decoded['width']),
            height: _dimension(decoded['height']),
          );
        }
      }
    } on FormatException {
      // Fall back to the raw string.
    }
    return _TaskDescriptionImageData(src: trimmed);
  }

  /// A pixel dimension from a number or a `"320"`/`"320px"` string.
  /// Percentages and other units carry no fixed size, so they read as
  /// null.
  static double? _dimension(Object? value) {
    final parsed = switch (value) {
      final num number => number.toDouble(),
      final String text => double.tryParse(
        text.trim().toLowerCase().replaceFirst(RegExp(r'px$'), ''),
      ),
      _ => null,
    };
    return parsed != null && parsed.isFinite && parsed > 0 ? parsed : null;
  }

  final String src;
  final double? width;
  final double? height;
}

/// Tallest an inline image renders before it crops.
const double _imageMaxHeight = 300;

/// Placeholder height while an image of unknown size loads.
const double _imageUnknownPlaceholderHeight = 180;

class _TaskDescriptionImagePreview extends StatelessWidget {
  const _TaskDescriptionImagePreview({
    required this.url,
    this.headers,
    this.width,
    this.height,
  });

  final String url;
  final Map<String, String>? headers;

  /// The web's display size, used to reserve the image's box before it
  /// loads so the description does not jump.
  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final heroTag = 'task-description-image-$url';
    final width = this.width;
    final height = this.height;
    final aspectRatio = width != null && height != null ? width / height : null;
    // Decode at the displayed width, not the source resolution.
    final screenWidth = MediaQuery.sizeOf(context).width;
    final displayWidth = width == null
        ? screenWidth
        : width.clamp(0, screenWidth);
    final cacheWidth = (displayWidth * MediaQuery.devicePixelRatioOf(context))
        .round();

    final placeholder = Container(
      height: aspectRatio == null ? _imageUnknownPlaceholderHeight : null,
      color: theme.colorScheme.secondary.withValues(alpha: 0.25),
      alignment: Alignment.center,
      child: const SizedBox(
        width: 20,
        height: 20,
        child: NovaLoadingIndicator(size: 20),
      ),
    );

    Widget image = Image.network(
      url,
      key: const ValueKey('task-description-image'),
      fit: BoxFit.cover,
      headers: headers,
      cacheWidth: cacheWidth > 0 ? cacheWidth : null,
      errorBuilder: (context2, e, _) => buildEmbedFallback(
        context,
        theme: theme,
        icon: Icons.broken_image_outlined,
        label: context.l10n.taskDescriptionImageUnavailable,
      ),
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : placeholder,
    );
    if (aspectRatio != null) {
      // The stored size reserves the box up front; an image the web
      // shows narrower than the screen keeps that width.
      image = ConstrainedBox(
        constraints: BoxConstraints(maxWidth: width ?? double.infinity),
        child: AspectRatio(aspectRatio: aspectRatio, child: image),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: _imageMaxHeight),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => _openFullscreen(context, heroTag),
              child: Hero(tag: heroTag, child: image),
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
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
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
