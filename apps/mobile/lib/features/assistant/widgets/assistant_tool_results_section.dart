import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantToolResultsSection extends StatefulWidget {
  const AssistantToolResultsSection({
    required this.parts,
    super.key,
  });

  final List<AssistantMessagePart> parts;

  @override
  State<AssistantToolResultsSection> createState() =>
      _AssistantToolResultsSectionState();
}

class AssistantInlineToolImages extends StatelessWidget {
  const AssistantInlineToolImages({
    required this.parts,
    super.key,
  });

  final List<AssistantMessagePart> parts;

  @override
  Widget build(BuildContext context) {
    final imageParts = assistantImageToolParts(parts);
    if (imageParts.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < imageParts.length; i++) ...[
          _AssistantGeneratedImage(
            imageUrl: _toolImageResult(imageParts[i])?.imageUrl,
            storagePath: _toolImageResult(imageParts[i])?.storagePath,
            alt: context.l10n.assistantToolGeneratedImage,
          ),
          if (i != imageParts.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _AssistantToolResultsSectionState
    extends State<AssistantToolResultsSection> {
  var _expanded = false;

  @override
  Widget build(BuildContext context) {
    final parts = _visibleToolParts(widget.parts);
    if (parts.isEmpty) {
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final itemCountLabel = parts.length == 1
        ? context.l10n.assistantToolLabel.toLowerCase()
        : context.l10n.assistantToolsLabel.toLowerCase();

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.52),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.8),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => setState(() => _expanded = !_expanded),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.handyman_outlined, size: 18),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            context.l10n.assistantToolsLabel,
                            style: theme.textTheme.labelLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            '${parts.length} $itemCountLabel',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    AnimatedRotation(
                      turns: _expanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 180),
                      child: Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          AnimatedCrossFade(
            duration: const Duration(milliseconds: 180),
            crossFadeState: _expanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            firstChild: const SizedBox.shrink(),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < parts.length; i++) ...[
                    _AssistantToolResultTile(part: parts[i]),
                    if (i != parts.length - 1) const SizedBox(height: 10),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

List<AssistantMessagePart> _visibleToolParts(List<AssistantMessagePart> parts) {
  final hasNonSelectorTool = parts.any(
    (part) => part.toolName != 'select_tools' && !_isInlineImageToolPart(part),
  );
  return parts
      .where((part) {
        if (_isInlineImageToolPart(part)) {
          return false;
        }
        if (part.toolName == 'select_tools' && hasNonSelectorTool) {
          return false;
        }
        return true;
      })
      .toList(growable: false);
}

List<AssistantMessagePart> assistantImageToolParts(
  List<AssistantMessagePart> parts,
) {
  return parts.where(_isInlineImageToolPart).toList(growable: false);
}

bool _isInlineImageToolPart(AssistantMessagePart part) {
  return part.toolName == 'create_image' && _toolImageResult(part) != null;
}

class _AssistantToolResultTile extends StatefulWidget {
  const _AssistantToolResultTile({required this.part});

  final AssistantMessagePart part;

  @override
  State<_AssistantToolResultTile> createState() =>
      _AssistantToolResultTileState();
}

class _AssistantToolResultTileState extends State<_AssistantToolResultTile> {
  var _expanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = widget.part.toolName ?? context.l10n.assistantToolLabel;
    final subtitle = _toolCollapsedSummary(context, widget.part);
    final imageResult = _toolImageResult(widget.part);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => setState(() => _expanded = !_expanded),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Icon(
                      _toolIcon(widget.part.toolName),
                      size: 18,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: theme.textTheme.labelLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          if (subtitle != null)
                            Text(
                              subtitle,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                        ],
                      ),
                    ),
                    AnimatedRotation(
                      turns: _expanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 180),
                      child: Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (!_expanded && imageResult != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: _AssistantGeneratedImage(
                imageUrl: imageResult.imageUrl,
                storagePath: imageResult.storagePath,
                alt: context.l10n.assistantToolGeneratedImage,
              ),
            ),
          AnimatedCrossFade(
            duration: const Duration(milliseconds: 180),
            crossFadeState: _expanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            firstChild: const SizedBox.shrink(),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: _buildExpandedContent(context, imageResult),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExpandedContent(
    BuildContext context,
    _AssistantToolImageResult? imageResult,
  ) {
    final outputRecord = _asMap(widget.part.output);
    final selectedTools = _selectedTools(outputRecord);
    final theme = Theme.of(context);

    if (widget.part.toolName == 'select_tools') {
      if (selectedTools.length == 1 &&
          selectedTools.single == 'no_action_needed') {
        return Text(
          context.l10n.assistantToolNoActionNeeded,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        );
      }

      return Wrap(
        spacing: 8,
        runSpacing: 8,
        children: selectedTools
            .map((tool) => _AssistantResultChip(label: tool))
            .toList(growable: false),
      );
    }

    if (imageResult != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _AssistantGeneratedImage(
            imageUrl: imageResult.imageUrl,
            storagePath: imageResult.storagePath,
            alt: context.l10n.assistantToolGeneratedImage,
          ),
          if (imageResult.prompt case final prompt?
              when prompt.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: AssistantMarkdownBody(
                data: prompt.trim(),
                subdued: true,
              ),
            ),
        ],
      );
    }

    final markdownSummary = _toolOutputSummary(context, widget.part);
    if (markdownSummary != null) {
      return AssistantMarkdownBody(data: markdownSummary, subdued: true);
    }

    return _AssistantJsonPreview(data: widget.part.output);
  }
}

class _AssistantResultChip extends StatelessWidget {
  const _AssistantResultChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: theme.textTheme.labelMedium),
    );
  }
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
              child: const Center(child: CircularProgressIndicator()),
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
                    child: const Center(child: CircularProgressIndicator()),
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
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _AssistantGeneratedImageViewer(
          heroTag: _heroTag(imageUrl),
          initialUrl: imageUrl,
          storagePath: widget.storagePath,
          alt: widget.alt,
        ),
      ),
    );
  }

  String _heroTag(String imageUrl) =>
      'assistant-tool-image:${widget.storagePath ?? imageUrl}';
}

class _AssistantGeneratedImageViewer extends StatefulWidget {
  const _AssistantGeneratedImageViewer({
    required this.heroTag,
    required this.initialUrl,
    required this.storagePath,
    required this.alt,
  });

  final String heroTag;
  final String initialUrl;
  final String? storagePath;
  final String alt;

  @override
  State<_AssistantGeneratedImageViewer> createState() =>
      _AssistantGeneratedImageViewerState();
}

class _AssistantGeneratedImageViewerState
    extends State<_AssistantGeneratedImageViewer> {
  final _repository = AssistantRepository();
  late Future<String?> _imageUrlFuture;

  @override
  void initState() {
    super.initState();
    _imageUrlFuture = _resolveImageUrl();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: SafeArea(
        top: false,
        child: FutureBuilder<String?>(
          future: _imageUrlFuture,
          builder: (context, snapshot) {
            final url = snapshot.data ?? widget.initialUrl;
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            return Center(
              child: InteractiveViewer(
                minScale: 0.75,
                maxScale: 5,
                child: Hero(
                  tag: widget.heroTag,
                  child: Image.network(
                    url,
                    fit: BoxFit.contain,
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
            );
          },
        ),
      ),
    );
  }

  Future<String?> _resolveImageUrl() async {
    if (!_isSignedUrlExpired(widget.initialUrl)) {
      return widget.initialUrl;
    }

    final storagePath = widget.storagePath?.trim();
    if (storagePath == null || storagePath.isEmpty) {
      return widget.initialUrl;
    }

    try {
      final urls = await _repository.fetchSignedReadUrls([storagePath]);
      return urls[storagePath] ?? widget.initialUrl;
    } on Exception {
      return widget.initialUrl;
    }
  }
}

class _AssistantImageFrame extends StatelessWidget {
  const _AssistantImageFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: AspectRatio(
        aspectRatio: 1,
        child: child,
      ),
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
                Icons.broken_image_outlined,
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

class _AssistantJsonPreview extends StatelessWidget {
  const _AssistantJsonPreview({required this.data});

  final dynamic data;

  @override
  Widget build(BuildContext context) {
    const encoder = JsonEncoder.withIndent('  ');
    final pretty = switch (data) {
      null => '{}',
      String() => data,
      _ => encoder.convert(data),
    };

    return AssistantMarkdownBody(
      data: '```json\n$pretty\n```',
      subdued: true,
    );
  }
}

IconData _toolIcon(String? toolName) {
  return switch (toolName) {
    'create_image' => Icons.image_outlined,
    'select_tools' => Icons.tune_rounded,
    _ => Icons.handyman_outlined,
  };
}

String? _toolCollapsedSummary(
  BuildContext context,
  AssistantMessagePart part,
) {
  final inputRecord = _asMap(part.input);
  final outputRecord = _asMap(part.output);

  if (part.toolName == 'create_image') {
    return context.l10n.assistantToolGeneratedImage;
  }

  if (part.toolName == 'select_tools') {
    final selectedTools = _selectedTools(outputRecord);
    if (selectedTools.length == 1 &&
        selectedTools.single == 'no_action_needed') {
      return context.l10n.assistantToolNoActionNeeded;
    }
    if (selectedTools.isNotEmpty) {
      return selectedTools.join(', ');
    }
  }

  final prompt = inputRecord?['prompt']?.toString().trim();
  if (prompt != null && prompt.isNotEmpty) {
    return prompt;
  }

  return _toolOutputSummary(context, part) ??
      context.l10n.assistantToolCompleted;
}

Map<String, dynamic>? _asMap(dynamic value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return Map<String, dynamic>.from(value);
  }
  return null;
}

List<String> _selectedTools(Map<String, dynamic>? outputRecord) {
  final selected = outputRecord?['selectedTools'];
  if (selected is! List) {
    return const [];
  }
  return selected.map((tool) => tool.toString()).toList(growable: false);
}

String? _toolOutputSummary(BuildContext context, AssistantMessagePart part) {
  final output = part.output;
  if (output is String && output.trim().isNotEmpty) {
    return output.trim();
  }

  final outputRecord = _asMap(output);
  if (outputRecord == null) {
    return null;
  }

  if (outputRecord['success'] == true && outputRecord['prompt'] is String) {
    return outputRecord['prompt'] as String;
  }

  if (outputRecord['ok'] == true && outputRecord['selectedTools'] is List) {
    final tools = _selectedTools(outputRecord);
    if (tools.isNotEmpty) {
      return [
        context.l10n.assistantToolSelectedTools,
        tools.map((tool) => '- `$tool`').join('\n'),
      ].join('\n\n');
    }
  }

  return null;
}

_AssistantToolImageResult? _toolImageResult(AssistantMessagePart part) {
  final outputRecord = _asMap(part.output);
  if (outputRecord == null) {
    return null;
  }

  final imageUrl = outputRecord['imageUrl']?.toString().trim();
  final storagePath = outputRecord['storagePath']?.toString().trim();
  if ((imageUrl == null || imageUrl.isEmpty) &&
      (storagePath == null || storagePath.isEmpty)) {
    return null;
  }

  return _AssistantToolImageResult(
    imageUrl: imageUrl,
    storagePath: storagePath,
    prompt: outputRecord['prompt']?.toString(),
  );
}

class _AssistantToolImageResult {
  const _AssistantToolImageResult({
    required this.imageUrl,
    required this.storagePath,
    required this.prompt,
  });

  final String? imageUrl;
  final String? storagePath;
  final String? prompt;
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
