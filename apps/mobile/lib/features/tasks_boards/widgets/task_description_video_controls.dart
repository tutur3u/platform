import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:video_player/video_player.dart';

class TaskDescriptionVideoControls extends StatelessWidget {
  const TaskDescriptionVideoControls({
    required this.controller,
    required this.showControls,
    required this.onToggleControls,
    required this.onTogglePlayback,
    required this.onSeek,
    required this.onToggleMuted,
    required this.onSetVolume,
    required this.onInteractionStart,
    required this.onInteractionEnd,
    super.key,
    this.onOpenFullscreen,
    this.immersive = false,
  });

  final VideoPlayerController controller;
  final bool showControls;
  final VoidCallback onToggleControls;
  final VoidCallback onTogglePlayback;
  final ValueChanged<double> onSeek;
  final VoidCallback onToggleMuted;
  final ValueChanged<double> onSetVolume;
  final ValueChanged<double> onInteractionStart;
  final ValueChanged<double> onInteractionEnd;
  final VoidCallback? onOpenFullscreen;
  final bool immersive;

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
    final value = controller.value;
    final position = value.position;
    final duration = value.duration;
    final progress = duration.inMilliseconds > 0
        ? position.inMilliseconds / duration.inMilliseconds
        : 0.0;
    final clampedProgress = progress.clamp(0.0, 1.0);
    final playButtonSize = immersive ? 70.0 : 54.0;
    final controlPadding = immersive
        ? const EdgeInsets.fromLTRB(18, 44, 18, 18)
        : const EdgeInsets.all(10);
    final gradientOpacity = immersive ? 0.88 : 0.76;

    return GestureDetector(
      onTap: onToggleControls,
      child: Stack(
        fit: StackFit.expand,
        children: [
          VideoPlayer(controller),
          if (!value.isPlaying || showControls)
            AnimatedOpacity(
              opacity: value.isPlaying && !showControls ? 0 : 1,
              duration: const Duration(milliseconds: 200),
              child: ColoredBox(
                color: Colors.black.withValues(alpha: immersive ? 0.16 : 0.24),
                child: Center(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.38),
                      shape: BoxShape.circle,
                    ),
                    child: IconButton(
                      iconSize: playButtonSize,
                      constraints: BoxConstraints.tightFor(
                        width: playButtonSize + 16,
                        height: playButtonSize + 16,
                      ),
                      icon: Icon(
                        value.isPlaying
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                        color: Colors.white,
                      ),
                      onPressed: onTogglePlayback,
                    ),
                  ),
                ),
              ),
            ),
          if (showControls)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: AnimatedOpacity(
                opacity: showControls ? 1 : 0,
                duration: const Duration(milliseconds: 200),
                child: Container(
                  padding: controlPadding,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        Colors.black.withValues(alpha: gradientOpacity),
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
                                  inactiveTrackColor: Colors.white.withValues(
                                    alpha: 0.3,
                                  ),
                                  thumbColor: Colors.white,
                                  overlayColor: Colors.white.withValues(
                                    alpha: 0.2,
                                  ),
                                  trackHeight: 4,
                                  thumbShape: const RoundSliderThumbShape(
                                    enabledThumbRadius: 6,
                                  ),
                                ),
                                child: Slider(
                                  value: clampedProgress,
                                  onChanged: onSeek,
                                  onChangeStart: onInteractionStart,
                                  onChangeEnd: onInteractionEnd,
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
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            IconButton(
                              icon: Icon(
                                value.volume == 0
                                    ? Icons.volume_off
                                    : value.volume < 0.5
                                    ? Icons.volume_down
                                    : Icons.volume_up,
                                color: Colors.white,
                                size: 20,
                              ),
                              onPressed: onToggleMuted,
                            ),
                            if (!immersive)
                              Expanded(
                                child: SliderTheme(
                                  data: SliderTheme.of(context).copyWith(
                                    activeTrackColor: Colors.white,
                                    inactiveTrackColor: Colors.white.withValues(
                                      alpha: 0.3,
                                    ),
                                    thumbColor: Colors.white,
                                    overlayColor: Colors.white.withValues(
                                      alpha: 0.2,
                                    ),
                                    trackHeight: 3,
                                    thumbShape: const RoundSliderThumbShape(
                                      enabledThumbRadius: 5,
                                    ),
                                  ),
                                  child: Slider(
                                    value: value.volume,
                                    onChanged: onSetVolume,
                                    onChangeStart: onInteractionStart,
                                    onChangeEnd: onInteractionEnd,
                                  ),
                                ),
                              )
                            else
                              const Spacer(),
                            if (onOpenFullscreen != null)
                              IconButton(
                                tooltip:
                                    context.l10n.assistantEnterFullscreenAction,
                                icon: const Icon(
                                  Icons.open_in_full_rounded,
                                  color: Colors.white,
                                  size: 20,
                                ),
                                onPressed: onOpenFullscreen,
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
    );
  }
}
