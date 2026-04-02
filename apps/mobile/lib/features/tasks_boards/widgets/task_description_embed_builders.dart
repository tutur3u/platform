import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/utils/tiptap_description_parser.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:video_player/video_player.dart';

/// Shared embed builders for task description rendering.
/// Used by both the editor and the read-only viewer for feature parity.

/// Renders image embeds in task descriptions.
class TaskDescriptionImageEmbedBuilder extends EmbedBuilder {
  const TaskDescriptionImageEmbedBuilder();

  @override
  String get key => BlockEmbed.imageType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final src = embedContext.node.value.data as String? ?? '';
    if (src.trim().isEmpty) {
      return const SizedBox.shrink();
    }

    final resolved = _resolveTaskDescriptionUrl(src);
    final headers = _trustedAuthHeadersForUrl(resolved);
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
            errorBuilder: (context2, e, _) => _buildEmbedFallback(
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
}

/// Renders video embeds as a compact visual placeholder.
class TaskDescriptionVideoEmbedBuilder extends EmbedBuilder {
  const TaskDescriptionVideoEmbedBuilder();

  @override
  String get key => BlockEmbed.videoType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final src = embedContext.node.value.data as String? ?? '';
    if (src.trim().isEmpty) {
      final theme = shad.Theme.of(context);
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: _buildEmbedFallback(
          context,
          theme: theme,
          icon: Icons.play_circle_outline,
          label: 'Video',
        ),
      );
    }

    final resolved = _resolveTaskDescriptionUrl(src);
    final headers = _trustedAuthHeadersForUrl(resolved);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: _TaskDescriptionVideoPlayer(
        url: resolved,
        headers: headers,
      ),
    );
  }
}

class _TaskDescriptionVideoPlayer extends StatefulWidget {
  const _TaskDescriptionVideoPlayer({
    required this.url,
    this.headers,
  });

  final String url;
  final Map<String, String>? headers;

  @override
  State<_TaskDescriptionVideoPlayer> createState() =>
      _TaskDescriptionVideoPlayerState();
}

class _TaskDescriptionVideoPlayerState
    extends State<_TaskDescriptionVideoPlayer> {
  VideoPlayerController? _controller;
  late final Future<void> _initializeFuture;
  bool _showControls = true;
  Timer? _controlsTimer;

  @override
  void initState() {
    super.initState();
    _initializeFuture = _initializeController();
  }

  void _startControlsTimer() {
    _controlsTimer?.cancel();
    _controlsTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && _controller?.value.isPlaying == true) {
        setState(() => _showControls = false);
      }
    });
  }

  void _toggleControls() {
    setState(() => _showControls = !_showControls);
    if (_showControls) {
      _startControlsTimer();
    }
  }

  Future<void> _initializeController() async {
    final resolvedUrl = await _resolveVideoUrl(widget.url, widget.headers);
    if (!mounted) return;

    final resolvedHeaders = _trustedAuthHeadersForUrl(resolvedUrl);

    _controller = VideoPlayerController.networkUrl(
      Uri.parse(resolvedUrl),
      httpHeaders: resolvedHeaders ?? const <String, String>{},
    );
    await _controller!.initialize();
  }

  /// Resolves storage share URLs to signed URLs.
  /// For direct video URLs, returns the original URL.
  Future<String> _resolveVideoUrl(
    String url,
    Map<String, String>? headers,
  ) async {
    // If it's already a direct signed URL (contains token/signature), use it directly
    // Supabase signed URLs look like: .../sign/...?token=eyJ...
    if (url.contains('/sign/') ||
        url.contains('token=') ||
        url.contains('signature=')) {
      return url;
    }

    // If it's a public Supabase storage URL without signing, use directly
    if (url.contains('.supabase.co/storage/v1/object/public/')) {
      return url;
    }

    // If it's an internal API storage endpoint, we need to resolve it
    if (url.contains('/storage/share') ||
        (url.contains('/api/v1/') && url.contains('path='))) {
      try {
        final internalUri = Uri.parse(url);

        // Resolve redirect target without auto-following redirects.
        final httpClient = HttpClient();
        try {
          final request = await httpClient
              .openUrl('HEAD', internalUri)
              .timeout(const Duration(seconds: 10));
          request
            ..followRedirects = false
            ..maxRedirects = 0;
          for (final entry in {...?headers, 'Accept': '*/*'}.entries) {
            request.headers.set(entry.key, entry.value);
          }

          final response = await request.close().timeout(
            const Duration(seconds: 10),
          );

          final location = response.headers.value(HttpHeaders.locationHeader);
          if (location != null && location.isNotEmpty) {
            return internalUri.resolve(location).toString();
          }
        } finally {
          httpClient.close(force: true);
        }

        // Fallback path if endpoint is non-redirecting in this environment.
        final headResponse = await http
            .head(
              internalUri,
              headers: {
                ...?headers,
                'Accept': '*/*',
              },
            )
            .timeout(const Duration(seconds: 10));

        final redirectedHeadUrl = headResponse.request?.url.toString();
        if (redirectedHeadUrl != null &&
            redirectedHeadUrl.isNotEmpty &&
            !redirectedHeadUrl.contains('10.0.2.2')) {
          return redirectedHeadUrl;
        }

        if (headResponse.statusCode == 200) {
          // Might be JSON with signedUrl, fetch and parse
          final getResponse = await http
              .get(
                internalUri,
                headers: {
                  ...?headers,
                  'Accept': '*/*',
                },
              )
              .timeout(const Duration(seconds: 30));

          final redirectedGetUrl = getResponse.request?.url.toString();
          if (redirectedGetUrl != null &&
              redirectedGetUrl.isNotEmpty &&
              !redirectedGetUrl.contains('10.0.2.2')) {
            return redirectedGetUrl;
          }

          if (getResponse.statusCode == 200) {
            final contentType = getResponse.headers['content-type'] ?? '';

            // If it's JSON, parse for signedUrl
            if (contentType.contains('application/json')) {
              try {
                final json =
                    jsonDecode(getResponse.body) as Map<String, dynamic>;
                final signedUrl =
                    json['signedUrl'] as String? ??
                    json['url'] as String? ??
                    json['downloadUrl'] as String?;
                if (signedUrl != null && signedUrl.isNotEmpty) {
                  return signedUrl;
                }
              } on FormatException {
                // Not valid JSON, fall through
              }
            }

            // If content-type is video but URL is still local cleartext,
            // keep searching for a signed URL and avoid returning it.
          }
        }
      } on Exception catch (e) {
        debugPrint('Failed to resolve video URL: $e');
      }
    }

    // Return original URL as fallback
    return url;
  }

  @override
  void dispose() {
    _controlsTimer?.cancel();
    final controller = _controller;
    if (controller != null) {
      unawaited(controller.dispose());
    }
    super.dispose();
  }

  String _formatDuration(Duration duration) {
    final hours = duration.inHours;
    final minutes = duration.inMinutes.remainder(60);
    final seconds = duration.inSeconds.remainder(60);
    if (hours > 0) {
      final mStr = minutes.toString().padLeft(2, '0');
      final sStr = seconds.toString().padLeft(2, '0');
      return '$hours:$mStr:$sStr';
    }
    final mStr = minutes.toString().padLeft(2, '0');
    final sStr = seconds.toString().padLeft(2, '0');
    return '$mStr:$sStr';
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return FutureBuilder<void>(
      future: _initializeFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          debugPrint(
            'Task description video initialize error: ${snapshot.error}',
          );
          return _buildEmbedFallback(
            context,
            theme: theme,
            icon: Icons.play_circle_outline,
            label: 'Video unavailable',
          );
        }

        if (snapshot.connectionState != ConnectionState.done) {
          return Container(
            height: 120,
            decoration: BoxDecoration(
              color: theme.colorScheme.secondary.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: theme.colorScheme.border.withValues(alpha: 0.6),
              ),
            ),
            alignment: Alignment.center,
            child: const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
        }

        final controller = _controller;
        if (controller == null) {
          return _buildEmbedFallback(
            context,
            theme: theme,
            icon: Icons.play_circle_outline,
            label: 'Video unavailable',
          );
        }

        final aspectRatio = controller.value.aspectRatio > 0
            ? controller.value.aspectRatio
            : 16 / 9;

        final position = controller.value.position;
        final duration = controller.value.duration;
        final progress = duration.inMilliseconds > 0
            ? position.inMilliseconds / duration.inMilliseconds
            : 0.0;

        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: AspectRatio(
            aspectRatio: aspectRatio,
            child: GestureDetector(
              onTap: _toggleControls,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Video
                  VideoPlayer(controller),

                  // Play/Pause overlay (shown when paused or controls visible)
                  if (!controller.value.isPlaying || _showControls)
                    AnimatedOpacity(
                      opacity: controller.value.isPlaying && !_showControls
                          ? 0
                          : 1,
                      duration: const Duration(milliseconds: 200),
                      child: ColoredBox(
                        color: Colors.black.withValues(alpha: 0.3),
                        child: Center(
                          child: IconButton(
                            iconSize: 64,
                            icon: Icon(
                              controller.value.isPlaying
                                  ? Icons.pause_circle_filled
                                  : Icons.play_circle_fill,
                              color: Colors.white,
                            ),
                            onPressed: () {
                              setState(() {
                                if (controller.value.isPlaying) {
                                  unawaited(controller.pause());
                                } else {
                                  unawaited(controller.play());
                                  _startControlsTimer();
                                }
                              });
                            },
                          ),
                        ),
                      ),
                    ),

                  // Controls overlay
                  if (_showControls)
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: AnimatedOpacity(
                        opacity: _showControls ? 1 : 0,
                        duration: const Duration(milliseconds: 200),
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.bottomCenter,
                              end: Alignment.topCenter,
                              colors: [
                                Colors.black.withValues(alpha: 0.8),
                                Colors.transparent,
                              ],
                            ),
                          ),
                          child: SafeArea(
                            top: false,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                // Progress bar
                                Row(
                                  children: [
                                    // Current time
                                    Text(
                                      _formatDuration(position),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    // Scrubber
                                    Expanded(
                                      child: SliderTheme(
                                        data: SliderTheme.of(context).copyWith(
                                          activeTrackColor: Colors.white,
                                          inactiveTrackColor: Colors.white
                                              .withValues(alpha: 0.3),
                                          thumbColor: Colors.white,
                                          overlayColor: Colors.white.withValues(
                                            alpha: 0.2,
                                          ),
                                          trackHeight: 4,
                                          thumbShape:
                                              const RoundSliderThumbShape(
                                                enabledThumbRadius: 6,
                                              ),
                                        ),
                                        child: Slider(
                                          value: progress.clamp(0, 1),
                                          onChanged: (value) {
                                            final newPosition = Duration(
                                              milliseconds:
                                                  (value *
                                                          duration
                                                              .inMilliseconds)
                                                      .toInt(),
                                            );
                                            unawaited(
                                              controller.seekTo(newPosition),
                                            );
                                          },
                                          onChangeStart: (_) =>
                                              _controlsTimer?.cancel(),
                                          onChangeEnd: (_) =>
                                              _startControlsTimer(),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    // Total duration
                                    Text(
                                      _formatDuration(duration),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                // Volume and mute controls
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    IconButton(
                                      icon: Icon(
                                        controller.value.volume == 0
                                            ? Icons.volume_off
                                            : controller.value.volume < 0.5
                                            ? Icons.volume_down
                                            : Icons.volume_up,
                                        color: Colors.white,
                                        size: 20,
                                      ),
                                      onPressed: () {
                                        setState(() {
                                          if (controller.value.volume > 0) {
                                            unawaited(controller.setVolume(0));
                                          } else {
                                            unawaited(
                                              controller.setVolume(1),
                                            );
                                          }
                                        });
                                      },
                                    ),
                                    SizedBox(
                                      width: 100,
                                      child: SliderTheme(
                                        data: SliderTheme.of(context).copyWith(
                                          activeTrackColor: Colors.white,
                                          inactiveTrackColor: Colors.white
                                              .withValues(alpha: 0.3),
                                          thumbColor: Colors.white,
                                          overlayColor: Colors.white.withValues(
                                            alpha: 0.2,
                                          ),
                                          trackHeight: 3,
                                          thumbShape:
                                              const RoundSliderThumbShape(
                                                enabledThumbRadius: 5,
                                              ),
                                        ),
                                        child: Slider(
                                          value: controller.value.volume,
                                          onChanged: (value) {
                                            unawaited(
                                              controller.setVolume(value),
                                            );
                                          },
                                          onChangeStart: (_) =>
                                              _controlsTimer?.cancel(),
                                          onChangeEnd: (_) =>
                                              _startControlsTimer(),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Renders mention embeds as green chips.
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

/// Renders table embeds as a native Flutter Table widget.
class TaskDescriptionTableEmbedBuilder extends EmbedBuilder {
  const TaskDescriptionTableEmbedBuilder({
    this.onTableUpdated,
  });

  final Future<void> Function(EmbedContext context, String tableJson)?
  onTableUpdated;

  @override
  String get key => 'table';

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final data = embedContext.node.value.data as String? ?? '';
    if (data.isEmpty) return const SizedBox.shrink();

    try {
      final tableNode = jsonDecode(data);
      if (tableNode is! Map<String, dynamic>) return const SizedBox.shrink();
      return _buildTable(
        context,
        embedContext: embedContext,
        tableNode: tableNode,
      );
    } on Object {
      return const SizedBox.shrink();
    }
  }

  Widget _buildTable(
    BuildContext context, {
    required EmbedContext embedContext,
    required Map<String, dynamic> tableNode,
  }) {
    final rows = (tableNode['content'] as List?)?.cast<Object?>() ?? const [];
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final canEdit = !embedContext.readOnly && onTableUpdated != null;

    final tableRows = <TableRow>[];
    var isFirstRow = true;

    for (final rowRaw in rows) {
      if (rowRaw is! Map<String, dynamic> || rowRaw['type'] != 'tableRow') {
        continue;
      }

      final cells = (rowRaw['content'] as List?)?.cast<Object?>() ?? const [];
      final isHeader = isFirstRow;
      final cellWidgets = <Widget>[];

      for (final cellRaw in cells) {
        final text = cellRaw is Map<String, dynamic>
            ? _extractText(cellRaw['content'])
            : '';
        cellWidgets.add(
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Text(
              text,
              style: isHeader
                  ? theme.typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                    )
                  : theme.typography.small,
            ),
          ),
        );
      }

      if (cellWidgets.isNotEmpty) {
        tableRows.add(
          TableRow(
            decoration: isHeader
                ? BoxDecoration(
                    color: theme.colorScheme.secondary.withValues(alpha: 0.35),
                  )
                : null,
            children: cellWidgets,
          ),
        );
      }
      isFirstRow = false;
    }

    if (tableRows.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (canEdit)
            Align(
              alignment: Alignment.centerRight,
              child: shad.GhostButton(
                density: shad.ButtonDensity.compact,
                onPressed: () => _openTableEditor(
                  context,
                  embedContext,
                  tableNode,
                ),
                leading: const Icon(Icons.edit_outlined, size: 14),
                child: Text(l10n.timerGoalsEdit),
              ),
            ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Table(
              border: TableBorder.all(
                color: theme.colorScheme.border,
              ),
              defaultColumnWidth: const IntrinsicColumnWidth(),
              children: tableRows,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openTableEditor(
    BuildContext context,
    EmbedContext embedContext,
    Map<String, dynamic> tableNode,
  ) async {
    final edited = await showAdaptiveSheet<Map<String, dynamic>>(
      context: context,
      maxDialogWidth: 920,
      builder: (sheetContext) => TaskDescriptionTableEditorSheet(
        initialTableNode: tableNode,
      ),
    );
    if (edited == null || onTableUpdated == null || !context.mounted) {
      return;
    }

    await onTableUpdated!(embedContext, jsonEncode(edited));
  }

  String _extractText(Object? content) {
    if (content is! List) return '';
    final buffer = StringBuffer();
    for (final node in content) {
      if (node is! Map<String, dynamic>) continue;
      if (node['type'] == 'text') {
        buffer.write(node['text'] as String? ?? '');
      } else {
        buffer.write(_extractText(node['content']));
      }
    }
    return buffer.toString();
  }
}

class TaskDescriptionTableEditorSheet extends StatefulWidget {
  const TaskDescriptionTableEditorSheet({
    required this.initialTableNode,
    super.key,
  });

  final Map<String, dynamic> initialTableNode;

  @override
  State<TaskDescriptionTableEditorSheet> createState() =>
      TaskDescriptionTableEditorSheetState();
}

class TaskDescriptionTableEditorSheetState
    extends State<TaskDescriptionTableEditorSheet> {
  late final List<List<TextEditingController>> _controllers;

  int get rowCount => _controllers.length;
  int get columnCount => rowCount > 0 ? _controllers.first.length : 0;

  @override
  void initState() {
    super.initState();
    final matrix = _tableTextMatrixFromNode(widget.initialTableNode);
    _controllers = matrix
        .map(
          (row) =>
              row.map((value) => TextEditingController(text: value)).toList(),
        )
        .toList();
  }

  @override
  void dispose() {
    for (final row in _controllers) {
      for (final controller in row) {
        controller.dispose();
      }
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final rows = rowCount;
    final cols = columnCount;

    return Material(
      color: theme.colorScheme.background,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.timerGoalsEdit,
                style: theme.typography.h4,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  shad.OutlineButton(
                    density: shad.ButtonDensity.compact,
                    leading: const Icon(Icons.add, size: 14),
                    onPressed: _addRow,
                    child: Text(l10n.taskBoardDetailTaskDescriptionTableAddRow),
                  ),
                  shad.OutlineButton(
                    density: shad.ButtonDensity.compact,
                    leading: const Icon(Icons.remove, size: 14),
                    onPressed: rows > 1 ? _removeRow : null,
                    child: Text(
                      l10n.taskBoardDetailTaskDescriptionTableRemoveRow,
                    ),
                  ),
                  shad.OutlineButton(
                    density: shad.ButtonDensity.compact,
                    leading: const Icon(Icons.add, size: 14),
                    onPressed: _addColumn,
                    child: Text(
                      l10n.taskBoardDetailTaskDescriptionTableAddColumn,
                    ),
                  ),
                  shad.OutlineButton(
                    density: shad.ButtonDensity.compact,
                    leading: const Icon(Icons.remove, size: 14),
                    onPressed: cols > 1 ? _removeColumn : null,
                    child: Text(
                      l10n.taskBoardDetailTaskDescriptionTableRemoveColumn,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Expanded(
                child: SingleChildScrollView(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Table(
                      border: TableBorder.all(color: theme.colorScheme.border),
                      defaultColumnWidth: const FixedColumnWidth(180),
                      children: [
                        for (var rowIndex = 0; rowIndex < rows; rowIndex++)
                          TableRow(
                            decoration: rowIndex == 0
                                ? BoxDecoration(
                                    color: theme.colorScheme.secondary
                                        .withValues(alpha: 0.35),
                                  )
                                : null,
                            children: [
                              for (
                                var columnIndex = 0;
                                columnIndex < cols;
                                columnIndex++
                              )
                                Padding(
                                  padding: const EdgeInsets.all(6),
                                  child: shad.TextField(
                                    controller:
                                        _controllers[rowIndex][columnIndex],
                                  ),
                                ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  shad.OutlineButton(
                    onPressed: () async {
                      await Navigator.of(context).maybePop();
                    },
                    child: Text(l10n.commonCancel),
                  ),
                  const SizedBox(width: 8),
                  shad.PrimaryButton(
                    onPressed: () async {
                      final editedNode = buildEditedTableNode();
                      await Navigator.of(context).maybePop(editedNode);
                    },
                    child: Text(l10n.taskBoardDetailTaskDescriptionDone),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _addRow() {
    final cols = columnCount == 0 ? 1 : columnCount;
    setState(() {
      _controllers.add(
        List<TextEditingController>.generate(
          cols,
          (_) => TextEditingController(),
        ),
      );
    });
  }

  void _removeRow() {
    if (rowCount <= 1) return;
    setState(() {
      final removed = _controllers.removeLast();
      for (final controller in removed) {
        controller.dispose();
      }
    });
  }

  void _addColumn() {
    setState(() {
      for (final row in _controllers) {
        row.add(TextEditingController());
      }
    });
  }

  void _removeColumn() {
    if (columnCount <= 1) return;
    setState(() {
      for (final row in _controllers) {
        row.removeLast().dispose();
      }
    });
  }

  Map<String, dynamic> buildEditedTableNode() {
    final attrs =
        (widget.initialTableNode['attrs'] as Map?)?.cast<String, dynamic>() ??
        const <String, dynamic>{};
    final originalRows =
        (widget.initialTableNode['content'] as List?)?.cast<Object?>() ??
        const [];

    final rows = <Map<String, dynamic>>[];
    for (var rowIndex = 0; rowIndex < _controllers.length; rowIndex++) {
      final rowControllers = _controllers[rowIndex];
      final originalRow = rowIndex < originalRows.length
          ? originalRows[rowIndex] as Map<String, dynamic>?
          : null;
      final originalCells =
          (originalRow?['content'] as List?)?.cast<Object?>() ?? const [];

      final cells = <Map<String, dynamic>>[];
      for (
        var columnIndex = 0;
        columnIndex < rowControllers.length;
        columnIndex++
      ) {
        final originalCell = columnIndex < originalCells.length
            ? originalCells[columnIndex] as Map<String, dynamic>?
            : null;
        final text = rowControllers[columnIndex].text;
        cells.add(
          _buildUpdatedCell(
            rowIndex: rowIndex,
            originalCell: originalCell,
            text: text,
          ),
        );
      }

      rows.add(
        <String, dynamic>{
          'type': 'tableRow',
          if (originalRow?['attrs'] is Map)
            'attrs': (originalRow!['attrs'] as Map).cast<String, dynamic>(),
          'content': cells,
        },
      );
    }

    return <String, dynamic>{
      'type': 'table',
      if (attrs.isNotEmpty) 'attrs': attrs,
      'content': rows,
    };
  }

  Map<String, dynamic> _buildUpdatedCell({
    required int rowIndex,
    required Map<String, dynamic>? originalCell,
    required String text,
  }) {
    final fallbackType = rowIndex == 0 ? 'tableHeader' : 'tableCell';
    final type = originalCell?['type'] as String?;
    final resolvedType = type == 'tableHeader' || type == 'tableCell'
        ? type
        : fallbackType;

    final originalParagraph = _firstParagraphFromCell(originalCell);
    final paragraph = <String, dynamic>{
      'type': 'paragraph',
      if (originalParagraph?['attrs'] is Map)
        'attrs': (originalParagraph!['attrs'] as Map).cast<String, dynamic>(),
      if (text.trim().isNotEmpty)
        'content': [
          <String, dynamic>{
            'type': 'text',
            'text': text,
          },
        ],
    };

    return <String, dynamic>{
      'type': resolvedType,
      if (originalCell?['attrs'] is Map)
        'attrs': (originalCell!['attrs'] as Map).cast<String, dynamic>(),
      'content': [paragraph],
    };
  }

  Map<String, dynamic>? _firstParagraphFromCell(Map<String, dynamic>? cell) {
    final content = (cell?['content'] as List?)?.cast<Object?>() ?? const [];
    for (final node in content) {
      if (node is Map<String, dynamic> && node['type'] == 'paragraph') {
        return node;
      }
    }
    return null;
  }

  List<List<String>> _tableTextMatrixFromNode(Map<String, dynamic> tableNode) {
    final rows = (tableNode['content'] as List?)?.cast<Object?>() ?? const [];
    final matrix = <List<String>>[];

    var maxColumns = 0;
    for (final rowRaw in rows) {
      if (rowRaw is! Map<String, dynamic> || rowRaw['type'] != 'tableRow') {
        continue;
      }
      final cells = (rowRaw['content'] as List?)?.cast<Object?>() ?? const [];
      final values = <String>[];
      for (final cellRaw in cells) {
        if (cellRaw is! Map<String, dynamic>) {
          values.add('');
          continue;
        }
        values.add(_extractText(cellRaw['content']));
      }
      if (values.isNotEmpty) {
        maxColumns = math.max(maxColumns, values.length);
        matrix.add(values);
      }
    }

    if (maxColumns == 0) {
      maxColumns = 1;
    }
    if (matrix.isEmpty) {
      matrix.add(List<String>.filled(maxColumns, ''));
    }

    for (final row in matrix) {
      if (row.length < maxColumns) {
        row.addAll(List<String>.filled(maxColumns - row.length, ''));
      }
    }

    return matrix;
  }

  String _extractText(Object? content) {
    if (content is! List) return '';
    final buffer = StringBuffer();
    for (final node in content) {
      if (node is! Map<String, dynamic>) continue;
      if (node['type'] == 'text') {
        buffer.write(node['text'] as String? ?? '');
      } else {
        buffer.write(_extractText(node['content']));
      }
    }
    return buffer.toString();
  }
}

/// Renders a mention chip with green styling.
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
        color: const Color(0x3313B96D),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFF13B96D)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFF13B96D), width: 0.8),
            ),
            child: ClipOval(
              child: hasAvatar
                  ? (() {
                      final resolvedAvatarUrl = _resolveTaskDescriptionUrl(
                        avatarUrl,
                      );
                      return Image.network(
                        resolvedAvatarUrl,
                        fit: BoxFit.cover,
                        headers: _trustedAuthHeadersForUrl(resolvedAvatarUrl),
                        errorBuilder: (context, error, stackTrace) =>
                            const Icon(
                              Icons.person_outline,
                              size: 11,
                              color: Color(0xFF13B96D),
                            ),
                      );
                    })()
                  : const Icon(
                      Icons.person_outline,
                      size: 11,
                      color: Color(0xFF13B96D),
                    ),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            '@${mention.displayName}',
            style:
                preferredStyle?.copyWith(
                  color: const Color(0xFF4CE28C),
                  fontWeight: FontWeight.w600,
                ) ??
                theme.typography.small.copyWith(
                  color: const Color(0xFF4CE28C),
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

Widget _buildEmbedFallback(
  BuildContext context, {
  required shad.ThemeData theme,
  required IconData icon,
  required String label,
}) {
  return Container(
    height: 72,
    decoration: BoxDecoration(
      color: theme.colorScheme.secondary.withValues(alpha: 0.25),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(
        color: theme.colorScheme.border.withValues(alpha: 0.6),
      ),
    ),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 20, color: theme.colorScheme.mutedForeground),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    ),
  );
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

String _resolveTaskDescriptionUrl(String value) {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return '${ApiConfig.baseUrl}$value';
  }

  return value;
}

Map<String, String>? _taskDescriptionAuthHeaders() {
  final token = _currentSessionAccessToken();
  if (token == null || token.isEmpty) {
    return null;
  }

  return {'Authorization': 'Bearer $token'};
}

String? _currentSessionAccessToken() {
  return maybeSupabase?.auth.currentSession?.accessToken;
}

Map<String, String>? _trustedAuthHeadersForUrl(String? resolvedUrl) {
  if (!_isTrustedTaskDescriptionUrl(resolvedUrl)) {
    return null;
  }

  return _taskDescriptionAuthHeaders();
}

bool _isTrustedTaskDescriptionUrl(String? value) {
  final raw = value?.trim();
  if (raw == null || raw.isEmpty) return false;

  if (raw.startsWith('/')) {
    return true;
  }

  final uri = Uri.tryParse(raw);
  if (uri == null) {
    return false;
  }

  if (!uri.hasScheme || uri.scheme.isEmpty) {
    return false;
  }

  final scheme = uri.scheme.toLowerCase();
  if (scheme != 'http' && scheme != 'https') {
    return false;
  }

  final trustedHosts = _trustedTaskDescriptionHosts;
  if (uri.host.isEmpty) {
    return false;
  }

  return trustedHosts.contains(uri.host.toLowerCase());
}

Set<String> get _trustedTaskDescriptionHosts {
  final hosts = <String>{};

  void addHostFromUrl(String url) {
    final uri = Uri.tryParse(url.trim());
    final host = uri?.host;
    if (host == null || host.isEmpty) return;
    hosts.add(host.toLowerCase());
  }

  addHostFromUrl(ApiConfig.baseUrl);
  addHostFromUrl(Env.supabaseUrl);
  return hosts;
}
