import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Motion is driven by admitted assistant PCM, never microphone or text events.
class AssistantLivePlaybackBlob extends StatelessWidget {
  const AssistantLivePlaybackBlob({
    required this.energy,
    required this.bands,
    required this.active,
    super.key,
  });

  final double energy;
  final List<double> bands;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    double normalize(double value) =>
        active && value.isFinite ? value.clamp(0.0, 1.0) : 0.0;
    final values = [
      normalize(energy),
      ...List<double>.generate(
        3,
        (index) => normalize(index < bands.length ? bands[index] : 0),
      ),
    ];
    return ExcludeSemantics(
      child: TweenAnimationBuilder<List<double>>(
        tween: _SpectrumTween(begin: const [0, 0, 0, 0], end: values),
        duration: reducedMotion
            ? Duration.zero
            : const Duration(milliseconds: 90),
        curve: Curves.easeOut,
        builder: (context, spectrum, _) => SizedBox.square(
          dimension: 156,
          child: CustomPaint(
            key: const ValueKey('assistant-playback-spectrum'),
            painter: _PlaybackBlobPainter(
              spectrum: spectrum,
              colors: [colors.primary, colors.secondary, colors.tertiary],
              motion: !reducedMotion,
            ),
          ),
        ),
      ),
    );
  }
}

class _SpectrumTween extends Tween<List<double>> {
  _SpectrumTween({required super.begin, required super.end});

  @override
  List<double> lerp(double t) => List.generate(
    4,
    (index) => begin![index] + (end![index] - begin![index]) * t,
  );
}

class _PlaybackBlobPainter extends CustomPainter {
  const _PlaybackBlobPainter({
    required this.spectrum,
    required this.colors,
    required this.motion,
  });

  final List<double> spectrum;
  final List<Color> colors;
  final bool motion;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final energy = spectrum.first;
    for (var layer = 2; layer >= 0; layer--) {
      final radius = 43.0 + layer * 7 + (motion ? energy * 12 : 0);
      final path = Path();
      for (var index = 0; index <= 96; index++) {
        final angle = index / 96 * math.pi * 2;
        final deformation = motion
            ? math.sin(angle * 3 + layer) * spectrum[1] * 9 +
                  math.cos(angle * 5 - layer) * spectrum[2] * 7 +
                  math.sin(angle * 7) * spectrum[3] * 5
            : 0.0;
        final position =
            center +
            Offset(
              math.cos(angle) * (radius + deformation),
              math.sin(angle) * (radius + deformation),
            );
        if (index == 0) {
          path.moveTo(position.dx, position.dy);
        } else {
          path.lineTo(position.dx, position.dy);
        }
      }
      path.close();
      if (layer == 2) {
        canvas.drawPath(
          path,
          Paint()
            ..color = colors.first.withValues(alpha: .18 + energy * .12)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 16),
        );
      }
      canvas.drawPath(
        path,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              colors[layer].withValues(alpha: .8 - layer * .15),
              colors[(layer + 1) % 3].withValues(alpha: .48),
              colors[(layer + 2) % 3].withValues(alpha: .7),
            ],
          ).createShader(Offset.zero & size),
      );
    }
  }

  @override
  bool shouldRepaint(_PlaybackBlobPainter oldDelegate) =>
      oldDelegate.motion != motion ||
      !listEquals(oldDelegate.spectrum, spectrum) ||
      !listEquals(oldDelegate.colors, colors);
}
