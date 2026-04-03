import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_utils.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:video_player/video_player.dart';

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
        child: buildEmbedFallback(
          context,
          theme: theme,
          icon: Icons.play_circle_outline,
          label: 'Video',
        ),
      );
    }

    final resolved = resolveTaskDescriptionUrl(src);
    final headers = trustedAuthHeadersForUrl(resolved);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: _TaskDescriptionVideoPlayer(
        key: ValueKey<String>(resolved),
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
    super.key,
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

    final resolvedHeaders = trustedAuthHeadersForUrl(resolvedUrl);
    if (!mounted) return;

    final localController = VideoPlayerController.networkUrl(
      Uri.parse(resolvedUrl),
      httpHeaders: resolvedHeaders ?? const <String, String>{},
    );
    await localController.initialize();
    if (!mounted) {
      await localController.dispose();
      return;
    }

    localController.addListener(_onControllerUpdate);
    _controller = localController;
    setState(() {});
  }

  void _onControllerUpdate() {
    if (!mounted) return;
    setState(() {});
  }

  Future<String> _resolveVideoUrl(
    String url,
    Map<String, String>? headers,
  ) async {
    if (url.contains('/sign/') ||
        url.contains('token=') ||
        url.contains('signature=')) {
      return url;
    }

    if (url.contains('.supabase.co/storage/v1/object/public/')) {
      return url;
    }

    if (url.contains('/storage/share') ||
        (url.contains('/api/v1/') && url.contains('path='))) {
      try {
        final internalUri = Uri.parse(url);

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
            return _sanitizeResolvedVideoUrl(
                  internalUri.resolve(location).toString(),
                ) ??
                url;
          }
        } finally {
          httpClient.close(force: true);
        }

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
        final sanitizedHeadUrl = _sanitizeResolvedVideoUrl(redirectedHeadUrl);
        if (sanitizedHeadUrl != null) {
          return sanitizedHeadUrl;
        }

        if (headResponse.statusCode == 200) {
          final client = http.Client();
          try {
            final request = http.Request('GET', internalUri)
              ..headers.addAll({
                ...?headers,
                'Accept': '*/*',
                'Range': 'bytes=0-0',
              });
            final getResponse = await client
                .send(request)
                .timeout(const Duration(seconds: 30));

            final redirectedGetUrl = _sanitizeResolvedVideoUrl(
              getResponse.request?.url.toString(),
            );
            if (redirectedGetUrl != null) {
              return redirectedGetUrl;
            }

            final contentType = getResponse.headers['content-type'] ?? '';
            if (contentType.contains('application/json')) {
              try {
                final body = await getResponse.stream.bytesToString();
                final json = jsonDecode(body) as Map<String, dynamic>;
                final signedUrl =
                    json['signedUrl'] as String? ??
                    json['url'] as String? ??
                    json['downloadUrl'] as String?;
                if (signedUrl != null && signedUrl.isNotEmpty) {
                  return signedUrl;
                }
              } on FormatException {
                // Not valid JSON, fall through.
              }
            }
          } finally {
            client.close();
          }
        }
      } on Exception catch (e) {
        debugPrint('Failed to resolve video URL: $e');
      }
    }

    return url;
  }

  String? _sanitizeResolvedVideoUrl(String? resolvedUrl) {
    if (resolvedUrl == null || resolvedUrl.isEmpty) {
      return null;
    }
    if (resolvedUrl.contains('10.0.2.2')) {
      return null;
    }
    return resolvedUrl;
  }

  @override
  void dispose() {
    _controlsTimer?.cancel();
    final controller = _controller;
    if (controller != null) {
      controller.removeListener(_onControllerUpdate);
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
          return buildEmbedFallback(
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
          return buildEmbedFallback(
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
        final clampedProgress = progress.clamp(0.0, 1.0);

        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: AspectRatio(
            aspectRatio: aspectRatio,
            child: GestureDetector(
              onTap: _toggleControls,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  VideoPlayer(controller),
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
                                Row(
                                  children: [
                                    Text(
                                      _formatDuration(position),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
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
                                          value: clampedProgress,
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
                                            unawaited(controller.setVolume(1));
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
