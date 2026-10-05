import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Content of the existing shell dock; this never paints another navbar.
class AssistantInlineVoiceControls extends StatelessWidget {
  const AssistantInlineVoiceControls({
    required this.capture,
    required this.state,
    required this.onAttach,
    required this.onSend,
    super.key,
  });

  final AssistantVoiceCaptureCubit capture;
  final AssistantVoiceCaptureState state;
  final Future<void> Function() onAttach;
  final Future<void> Function() onSend;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    Widget action(String id, String label, IconData icon, VoidCallback onTap) =>
        IconButton(
          key: ValueKey(id),
          tooltip: label,
          constraints: const BoxConstraints.tightFor(width: 40, height: 44),
          style: const ButtonStyle(
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          padding: EdgeInsets.zero,
          onPressed: state.busy ? null : onTap,
          icon: Icon(icon, size: 22),
        );
    return Semantics(
      label: state.paused ? l10n.voicePaused : l10n.voiceRecording,
      child: Row(
        children: [
          if (state.paused)
            action(
              'voice-restart',
              l10n.voiceRetake,
              Icons.restart_alt_rounded,
              () => unawaited(capture.restart()),
            ),
          Expanded(
            child: SizedBox(
              height: 44,
              child: Row(
                children: [
                  Expanded(
                    child: CustomPaint(
                      key: const ValueKey('assistant-inline-voice-waveform'),
                      painter: _VoiceWaveformPainter(
                        state.levels,
                        Theme.of(context).colorScheme.primary,
                      ),
                      child: const SizedBox(height: 32),
                    ),
                  ),
                  const SizedBox(width: 6),
                  SizedBox(
                    width: 32,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        '${state.seconds ~/ 60}:'
                        '${(state.seconds % 60).toString().padLeft(2, '0')}',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (state.paused) ...[
            action(
              'voice-attach',
              l10n.voiceAttach,
              Icons.attach_file_rounded,
              () => unawaited(onAttach()),
            ),
            action(
              'voice-send',
              l10n.voiceSendNow,
              Icons.arrow_upward_rounded,
              () => unawaited(onSend()),
            ),
          ],
          IconButton(
            key: const ValueKey('voice-pause-resume'),
            tooltip: state.paused ? l10n.voiceResume : l10n.voicePause,
            constraints: const BoxConstraints.tightFor(width: 40, height: 44),
            style: const ButtonStyle(
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            padding: EdgeInsets.zero,
            onPressed: state.busy || (state.paused && state.seconds >= 120)
                ? null
                : () => unawaited(
                    state.paused ? capture.resume() : capture.pause(),
                  ),
            icon: Icon(
              state.paused ? Icons.mic_none_rounded : Icons.pause_rounded,
            ),
          ),
        ],
      ),
    );
  }
}

class _VoiceWaveformPainter extends CustomPainter {
  const _VoiceWaveformPainter(this.levels, this.color);
  final List<double> levels;
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    final count = (size.width / 5).floor().clamp(1, 32);
    for (var i = 0; i < count; i++) {
      final index = levels.length - count + i;
      final level = index < 0 ? 0.0 : levels[index];
      final height = 2 + level * (size.height - 4);
      final x = (i + 0.5) * size.width / count;
      canvas.drawLine(
        Offset(x, (size.height - height) / 2),
        Offset(x, (size.height + height) / 2),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_VoiceWaveformPainter oldDelegate) =>
      oldDelegate.levels != levels || oldDelegate.color != color;
}
