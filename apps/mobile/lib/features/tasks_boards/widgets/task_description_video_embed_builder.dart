import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_utils.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_video_controls.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_video_url_resolver.dart';
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
    final resolvedUrl = await resolveTaskDescriptionVideoUrl(
      widget.url,
      widget.headers,
    );
    if (!mounted) return;

    final resolvedHeaders = trustedAuthHeadersForUrl(resolvedUrl);
    if (!mounted) return;

    final localController = VideoPlayerController.networkUrl(
      Uri.parse(resolvedUrl),
      httpHeaders: resolvedHeaders ?? const <String, String>{},
    );
    try {
      await localController.initialize();
    } on Object {
      await localController.dispose();
      rethrow;
    }
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

        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: AspectRatio(
            aspectRatio: aspectRatio,
            child: TaskDescriptionVideoControls(
              controller: controller,
              showControls: _showControls,
              onToggleControls: _toggleControls,
              onTogglePlayback: () {
                setState(() {
                  if (controller.value.isPlaying) {
                    unawaited(controller.pause());
                  } else {
                    unawaited(controller.play());
                    _startControlsTimer();
                  }
                });
              },
              onSeek: (value) {
                final newPosition = Duration(
                  milliseconds:
                      (value * controller.value.duration.inMilliseconds)
                          .toInt(),
                );
                unawaited(controller.seekTo(newPosition));
              },
              onToggleMuted: () {
                setState(() {
                  if (controller.value.volume > 0) {
                    unawaited(controller.setVolume(0));
                  } else {
                    unawaited(controller.setVolume(1));
                  }
                });
              },
              onSetVolume: (value) {
                unawaited(controller.setVolume(value));
              },
              onInteractionStart: (_) => _controlsTimer?.cancel(),
              onInteractionEnd: (_) => _startControlsTimer(),
            ),
          ),
        );
      },
    );
  }
}
