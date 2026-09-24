import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

class MeetParticipantTile extends StatelessWidget {
  const MeetParticipantTile({
    required this.name,
    required this.microphoneOn,
    super.key,
    this.renderer,
    this.local = false,
    this.handRaised = false,
    this.reaction,
  });

  final String name;
  final bool microphoneOn;
  final RTCVideoRenderer? renderer;
  final bool local;
  final bool handRaised;
  final String? reaction;

  IconData? get reactionIcon => switch (reaction) {
    'like' => Icons.thumb_up,
    'heart' => Icons.favorite,
    'clap' => Icons.front_hand,
    'laugh' => Icons.sentiment_very_satisfied,
    'wow' => Icons.auto_awesome,
    'celebrate' => Icons.celebration,
    _ => null,
  };

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: ColoredBox(
        color: scheme.surfaceContainerHigh,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (renderer?.srcObject?.getVideoTracks().isNotEmpty == true)
              RTCVideoView(
                renderer!,
                mirror: local,
                objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
              )
            else
              Center(
                child: CircleAvatar(
                  radius: 32,
                  backgroundColor: scheme.primaryContainer,
                  child: Text(
                    name.isEmpty ? '?' : name.characters.first.toUpperCase(),
                    style: TextStyle(
                      color: scheme.onPrimaryContainer,
                      fontSize: 28,
                    ),
                  ),
                ),
              ),
            if (handRaised || reactionIcon != null)
              Positioned(
                top: 10,
                right: 10,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: scheme.tertiaryContainer,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (handRaised)
                          Icon(
                            Icons.back_hand,
                            size: 20,
                            color: scheme.onTertiaryContainer,
                          ),
                        if (handRaised && reactionIcon != null)
                          const SizedBox(width: 6),
                        if (reactionIcon != null)
                          Icon(
                            reactionIcon,
                            size: 20,
                            color: scheme.onTertiaryContainer,
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            Positioned(
              left: 10,
              right: 10,
              bottom: 10,
              child: Row(
                children: [
                  Flexible(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: scheme.surface.withValues(alpha: 0.85),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        child: Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ),
                  if (!microphoneOn) ...[
                    const SizedBox(width: 6),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: scheme.surface.withValues(alpha: 0.85),
                        shape: BoxShape.circle,
                      ),
                      child: const Padding(
                        padding: EdgeInsets.all(6),
                        child: Icon(Icons.mic_off, size: 16),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
