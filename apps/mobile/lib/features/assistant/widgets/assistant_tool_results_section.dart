import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_step_tile.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_steps.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_summary.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

part 'assistant_generated_image_viewer.dart';

/// The turn's single tool accordion; meta tools never render on their own.
class AssistantToolResultsSection extends StatelessWidget {
  const AssistantToolResultsSection({
    required this.parts,
    this.active = false,
    super.key,
  });

  final List<AssistantMessagePart> parts;

  /// Whether the owning message is still streaming.
  final bool active;

  @override
  Widget build(BuildContext context) {
    final steps = assistantVisibleToolSteps(parts);
    if (steps.isEmpty) {
      return active ? const _AssistantToolWorking() : const SizedBox.shrink();
    }
    return AssistantToolSummary(
      parts: steps,
      running: assistantToolStepsRunning(steps, active: active),
      tileBuilder: (part) => AssistantToolStepTile(part: part, active: active),
    );
  }
}

class _AssistantToolWorking extends StatelessWidget {
  const _AssistantToolWorking();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      key: const ValueKey('assistant-tools-working'),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const NovaLoadingIndicator(size: 16),
          const SizedBox(width: 8),
          Text(
            context.l10n.assistantToolStepWorking,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class AssistantInlineToolImages extends StatelessWidget {
  const AssistantInlineToolImages({required this.parts, super.key});

  final List<AssistantMessagePart> parts;

  @override
  Widget build(BuildContext context) {
    final images = [
      for (final part in assistantImageToolParts(parts))
        assistantToolImageFields(part.output)!,
    ];
    if (images.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < images.length; i++) ...[
          _AssistantGeneratedImage(
            imageUrl: images[i].imageUrl,
            storagePath: images[i].storagePath,
            alt: context.l10n.assistantToolGeneratedImage,
          ),
          if (i != images.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

List<AssistantMessagePart> assistantImageToolParts(
  List<AssistantMessagePart> parts,
) {
  return parts.where(isAssistantInlineImageToolPart).toList(growable: false);
}

class _AssistantGeneratedImage extends StatefulWidget {
  const _AssistantGeneratedImage({
    required this.imageUrl,
    required this.storagePath,
    required this.alt,
  });

  final String? imageUrl;
  final String? storagePath;
  final String alt;

  @override
  State<_AssistantGeneratedImage> createState() =>
      _AssistantGeneratedImageState();
}

class _AssistantGeneratedImageState extends State<_AssistantGeneratedImage> {
  final _repository = AssistantRepository();
  late Future<String?> _imageUrlFuture;
  bool _didRetryRefresh = false;

  @override
  void initState() {
    super.initState();
    _imageUrlFuture = _resolveImageUrl();
  }

  @override
  void didUpdateWidget(covariant _AssistantGeneratedImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.imageUrl != widget.imageUrl ||
        oldWidget.storagePath != widget.storagePath) {
      _didRetryRefresh = false;
      _imageUrlFuture = _resolveImageUrl();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return FutureBuilder<String?>(
      future: _imageUrlFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return _AssistantImageFrame(
            child: ColoredBox(
              color: theme.colorScheme.surfaceContainerHighest,
              child: const Center(child: NovaLoadingIndicator(size: 40)),
            ),
          );
        }

        final url = snapshot.data;
        if (url == null || url.isEmpty) {
          return _AssistantImageFrame(
            child: _AssistantImageErrorState(
              message: context.l10n.assistantToolImageUnavailable,
            ),
          );
        }

        return _AssistantImageFrame(
          child: GestureDetector(
            onTap: () => _openFullscreen(url),
            child: Hero(
              tag: _heroTag(url),
              child: Image.network(
                url,
                fit: BoxFit.cover,
                loadingBuilder: (context, child, progress) {
                  if (progress == null) {
                    return child;
                  }
                  return ColoredBox(
                    color: theme.colorScheme.surfaceContainerHighest,
                    child: const Center(child: NovaLoadingIndicator(size: 40)),
                  );
                },
                errorBuilder: (context, error, stackTrace) {
                  _scheduleRefreshOnError();
                  return _AssistantImageErrorState(
                    message: context.l10n.assistantToolImageUnavailable,
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }

  Future<String?> _resolveImageUrl({bool forceRefresh = false}) async {
    final currentUrl = widget.imageUrl?.trim();
    final storagePath = widget.storagePath?.trim();

    if (!forceRefresh &&
        currentUrl != null &&
        currentUrl.isNotEmpty &&
        !_isSignedUrlExpired(currentUrl)) {
      return currentUrl;
    }

    if (storagePath == null || storagePath.isEmpty) {
      return currentUrl;
    }

    try {
      final urls = await _repository.fetchSignedReadUrls([storagePath]);
      return urls[storagePath] ?? currentUrl;
    } on Exception {
      return currentUrl;
    }
  }

  void _scheduleRefreshOnError() {
    if (_didRetryRefresh || (widget.storagePath?.trim().isEmpty ?? true)) {
      return;
    }
    _didRetryRefresh = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _imageUrlFuture = _resolveImageUrl(forceRefresh: true);
      });
    });
  }

  Future<void> _openFullscreen(String imageUrl) async {
    await showAppSheet<void>(
      context: context,
      size: AppSheetSize.full,
      enableDrag: false,
      builder: (_) => _AssistantGeneratedImageViewer(
        initialUrl: imageUrl,
        storagePath: widget.storagePath,
        alt: widget.alt,
      ),
    );
  }

  String _heroTag(String imageUrl) =>
      'assistant-tool-image:${widget.storagePath ?? imageUrl}';
}

class _AssistantImageFrame extends StatelessWidget {
  const _AssistantImageFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: AspectRatio(aspectRatio: 1, child: child),
    );
  }
}

class _AssistantImageErrorState extends StatelessWidget {
  const _AssistantImageErrorState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ColoredBox(
      color: theme.colorScheme.surfaceContainerHighest,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                LucideIcons.imageOff,
                color: theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(height: 8),
              Text(
                message,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

bool _isSignedUrlExpired(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null) {
    return false;
  }

  final token = uri.queryParameters['token'];
  if (token == null || token.isEmpty) {
    return false;
  }

  final parts = token.split('.');
  if (parts.length < 2) {
    return false;
  }

  try {
    final payload = utf8.decode(
      base64Url.decode(base64Url.normalize(parts[1])),
    );
    final json = jsonDecode(payload);
    if (json is! Map<String, dynamic>) {
      return false;
    }
    final exp = json['exp'];
    if (exp is! num) {
      return false;
    }
    final expiry = DateTime.fromMillisecondsSinceEpoch(
      exp.toInt() * 1000,
      isUtc: true,
    );
    return expiry.isBefore(
      DateTime.now().toUtc().add(const Duration(minutes: 2)),
    );
  } on FormatException {
    return false;
  }
}
