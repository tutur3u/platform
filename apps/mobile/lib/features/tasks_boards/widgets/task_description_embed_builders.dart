import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/utils/tiptap_description_parser.dart';
import 'package:mobile/data/sources/supabase_client.dart';
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

  @override
  void initState() {
    super.initState();
    _initializeFuture = _initializeController();
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
        // First try a HEAD request to see if we get a redirect
        final headResponse = await http
            .head(
              Uri.parse(url),
              headers: {
                ...?headers,
                'Accept': '*/*',
              },
            )
            .timeout(const Duration(seconds: 10));

        final redirectedHeadUrl = headResponse.request?.url.toString();
        if (redirectedHeadUrl != null && redirectedHeadUrl.isNotEmpty) {
          return redirectedHeadUrl;
        }

        // Follow redirect if we get a 302/301 with Location header
        if (headResponse.statusCode >= 300 &&
            headResponse.statusCode < 400 &&
            headResponse.headers['location'] != null) {
          return headResponse.headers['location']!;
        }

        // If HEAD returns 200, try GET to get the response body
        if (headResponse.statusCode == 200) {
          // Might be JSON with signedUrl, fetch and parse
          final getResponse = await http
              .get(
                Uri.parse(url),
                headers: {
                  ...?headers,
                  'Accept': '*/*',
                },
              )
              .timeout(const Duration(seconds: 30));

          final redirectedGetUrl = getResponse.request?.url.toString();
          if (redirectedGetUrl != null && redirectedGetUrl.isNotEmpty) {
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

            // If content-type is video, URL is the video itself
            if (contentType.startsWith('video/')) {
              return url;
            }
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
    final controller = _controller;
    if (controller != null) {
      unawaited(controller.dispose());
    }
    super.dispose();
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

        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Stack(
            alignment: Alignment.center,
            children: [
              AspectRatio(
                aspectRatio: aspectRatio,
                child: VideoPlayer(controller),
              ),
              Positioned.fill(
                child: GestureDetector(
                  onTap: () {
                    setState(() {
                      if (controller.value.isPlaying) {
                        unawaited(controller.pause());
                      } else {
                        unawaited(controller.play());
                      }
                    });
                  },
                  child: ColoredBox(
                    color: Colors.black.withValues(
                      alpha: controller.value.isPlaying ? 0.08 : 0.3,
                    ),
                    child: Center(
                      child: Icon(
                        controller.value.isPlaying
                            ? Icons.pause_circle_filled
                            : Icons.play_circle_fill,
                        size: 48,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),
            ],
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
  const TaskDescriptionTableEmbedBuilder();

  @override
  String get key => 'table';

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final data = embedContext.node.value.data as String? ?? '';
    if (data.isEmpty) return const SizedBox.shrink();

    try {
      final tableNode = jsonDecode(data);
      if (tableNode is! Map<String, dynamic>) return const SizedBox.shrink();
      return _buildTable(context, tableNode);
    } on Object {
      return const SizedBox.shrink();
    }
  }

  Widget _buildTable(
    BuildContext context,
    Map<String, dynamic> tableNode,
  ) {
    final rows = (tableNode['content'] as List?)?.cast<Object?>() ?? const [];
    final theme = shad.Theme.of(context);

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
      child: Table(
        border: TableBorder.all(
          color: theme.colorScheme.border,
        ),
        defaultColumnWidth: const IntrinsicColumnWidth(),
        children: tableRows,
      ),
    );
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
