import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Only content: the shell remains the single owner of the dock surface.
class NotesVoiceControls extends StatelessWidget {
  const NotesVoiceControls({
    required this.capture,
    required this.state,
    required this.onCancel,
    super.key,
  });
  final AssistantVoiceCaptureCubit capture;
  final AssistantVoiceCaptureState state;
  final Future<void> Function() onCancel;
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Semantics(
      label: state.paused ? l10n.voicePaused : l10n.voiceRecording,
      child: Row(
        children: [
          IconButton(
            tooltip: MaterialLocalizations.of(context).cancelButtonLabel,
            onPressed: state.busy ? null : () => unawaited(onCancel()),
            icon: const Icon(Icons.close_rounded),
          ),
          if (state.paused)
            IconButton(
              tooltip: l10n.voiceRetake,
              onPressed: state.busy ? null : () => unawaited(capture.restart()),
              icon: const Icon(Icons.restart_alt_rounded),
            ),
          Expanded(
            child: SizedBox(
              height: 40,
              child: CustomPaint(
                key: const ValueKey('notes-voice-waveform'),
                painter: NotesWaveformPainter(
                  state.levels,
                  Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: SizedBox(
              width: 32,
              height: 44,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  '${state.seconds ~/ 60}:'
                  '${(state.seconds % 60).toString().padLeft(2, '0')}',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: state.paused ? l10n.voiceResume : l10n.voicePause,
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

class NotesWaveformPainter extends CustomPainter {
  const NotesWaveformPainter(this.levels, this.color);
  final List<double> levels;
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    if (levels.isEmpty) {
      canvas.drawLine(
        Offset(0, size.height / 2),
        Offset(size.width, size.height / 2),
        paint,
      );
      return;
    }
    final step = size.width / levels.length;
    for (var i = 0; i < levels.length; i++) {
      final height = 2 + levels[i].clamp(0, 1) * (size.height - 4);
      final x = step * (i + .5);
      canvas.drawLine(
        Offset(x, (size.height - height) / 2),
        Offset(x, (size.height + height) / 2),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(NotesWaveformPainter oldDelegate) =>
      oldDelegate.levels != levels || oldDelegate.color != color;
}
