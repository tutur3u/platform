import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// What the Live orb is expressing. Each mode sets the orb's palette, flow
/// speed and how strongly audio deforms it.
enum AssistantLiveOrbMode { idle, connecting, listening, speaking, failed }

/// Mira's Live orb. It always moves while visible: a slow organic flow at
/// rest, a faster swirl while connecting, a pulse that follows the microphone
/// while listening and a spectrum-driven ripple while Mira speaks. Speaking
/// motion is driven by admitted assistant PCM, never text events. Reduced
/// motion renders a still frame.
class AssistantLivePlaybackBlob extends StatefulWidget {
  const AssistantLivePlaybackBlob({
    required this.energy,
    required this.bands,
    required this.active,
    this.mode,
    this.listeningLevel = 0,
    super.key,
  });

  final double energy;
  final List<double> bands;

  /// Mira is speaking; assistant audio drives the ripple.
  final bool active;

  /// Explicit mode; defaults to speaking while [active], otherwise idle.
  final AssistantLiveOrbMode? mode;

  /// Microphone level in `[0, 1]`, used while listening.
  final double listeningLevel;

  AssistantLiveOrbMode get effectiveMode =>
      mode ??
      (active ? AssistantLiveOrbMode.speaking : AssistantLiveOrbMode.idle);

  @override
  State<AssistantLivePlaybackBlob> createState() =>
      _AssistantLivePlaybackBlobState();
}

class _AssistantLivePlaybackBlobState extends State<AssistantLivePlaybackBlob>
    with SingleTickerProviderStateMixin {
  late final AnimationController _clock = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 1),
  )..addListener(_tick);
  final _time = ValueNotifier<double>(0);
  Duration _last = Duration.zero;
  bool _reduced = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduced = MediaQuery.disableAnimationsOf(context);
    if (_reduced) {
      _clock.stop();
    } else if (!_clock.isAnimating) {
      _last = Duration.zero;
      _clock.repeat();
    }
  }

  void _tick() {
    final elapsed = _clock.lastElapsedDuration ?? Duration.zero;
    final delta = elapsed - _last;
    _last = elapsed;
    final seconds = delta.inMicroseconds / Duration.microsecondsPerSecond;
    _time.value += seconds.clamp(0.0, 0.1);
  }

  @override
  void dispose() {
    _clock.dispose();
    _time.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final mode = widget.effectiveMode;
    double normalize(double value, {bool when = true}) =>
        when && value.isFinite ? value.clamp(0.0, 1.0) : 0.0;
    final speaking = mode == AssistantLiveOrbMode.speaking;
    final level = switch (mode) {
      AssistantLiveOrbMode.speaking => normalize(widget.energy),
      AssistantLiveOrbMode.listening => normalize(widget.listeningLevel) * .7,
      _ => 0.0,
    };
    final values = [
      level,
      ...List<double>.generate(
        3,
        (index) => normalize(
          index < widget.bands.length ? widget.bands[index] : 0,
          when: speaking,
        ),
      ),
    ];
    final palette = mode == AssistantLiveOrbMode.failed
        ? [colors.error, colors.errorContainer, colors.onSurfaceVariant]
        : [colors.primary, colors.secondary, colors.tertiary];
    return ExcludeSemantics(
      child: TweenAnimationBuilder<List<double>>(
        tween: _SpectrumTween(begin: const [0, 0, 0, 0], end: values),
        duration: _reduced ? Duration.zero : const Duration(milliseconds: 90),
        curve: Curves.easeOut,
        builder: (context, spectrum, _) => SizedBox.square(
          dimension: 156,
          child: RepaintBoundary(
            child: CustomPaint(
              key: const ValueKey('assistant-playback-spectrum'),
              painter: _OrbPainter(
                time: _time,
                spectrum: spectrum,
                colors: palette,
                highlight: colors.brightness == Brightness.dark
                    ? colors.onSurface
                    : colors.surface,
                mode: mode,
                motion: !_reduced,
              ),
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

/// Flow speed and resting deformation for each mode.
({double speed, double rest, double swirl}) _orbDynamics(
  AssistantLiveOrbMode mode,
) => switch (mode) {
  AssistantLiveOrbMode.idle => (speed: .7, rest: 2.6, swirl: .25),
  AssistantLiveOrbMode.connecting => (speed: 1.9, rest: 4.2, swirl: 1.4),
  AssistantLiveOrbMode.listening => (speed: 1.1, rest: 3.2, swirl: .5),
  AssistantLiveOrbMode.speaking => (speed: 1.3, rest: 2.8, swirl: .6),
  AssistantLiveOrbMode.failed => (speed: .35, rest: 1.4, swirl: .1),
};

class _OrbPainter extends CustomPainter {
  _OrbPainter({
    required this.time,
    required this.spectrum,
    required this.colors,
    required this.highlight,
    required this.mode,
    required this.motion,
  }) : super(repaint: time);

  final ValueListenable<double> time;
  final List<double> spectrum;
  final List<Color> colors;
  final Color highlight;
  final AssistantLiveOrbMode mode;
  final bool motion;

  @override
  void paint(Canvas canvas, Size size) {
    final t = motion ? time.value : 0.0;
    final dynamics = _orbDynamics(mode);
    final center = size.center(Offset.zero);
    final energy = spectrum.first;
    final breath = math.sin(t * dynamics.speed * 1.4) * 1.8;
    final rect = Offset.zero & size;
    double angleOf(int layer) => t * dynamics.swirl + layer * 2.1;

    for (var layer = 2; layer >= 0; layer--) {
      final radius = 42.0 + layer * 7 + breath + energy * 13;
      final phase = t * dynamics.speed * (1 + layer * .35);
      final path = Path();
      for (var index = 0; index <= 120; index++) {
        final angle = index / 120 * math.pi * 2;
        final flow =
            math.sin(angle * 3 + phase + layer) * dynamics.rest +
            math.cos(angle * 2 - phase * .8 + layer * 1.7) * dynamics.rest * .7;
        final audio =
            math.sin(angle * 3 + layer + phase) * spectrum[1] * 9 +
            math.cos(angle * 5 - layer - phase * .6) * spectrum[2] * 7 +
            math.sin(angle * 7 + phase * 1.3) * spectrum[3] * 5 +
            math.sin(angle * 4 - phase * 1.5) * energy * 4;
        final r = radius + flow + audio;
        final position =
            center + Offset(math.cos(angle) * r, math.sin(angle) * r);
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
            ..color = colors.first.withValues(alpha: .2 + energy * .16)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18),
        );
      }
      canvas.drawPath(
        path,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment(
              math.cos(angleOf(layer)),
              math.sin(angleOf(layer)),
            ),
            end: Alignment(
              -math.cos(angleOf(layer)),
              -math.sin(angleOf(layer)),
            ),
            colors: [
              colors[layer].withValues(alpha: .86 - layer * .16),
              colors[(layer + 1) % 3].withValues(alpha: .5),
              colors[(layer + 2) % 3].withValues(alpha: .74),
            ],
          ).createShader(rect),
      );
    }

    // Soft specular highlight gives the orb depth in light and dark themes.
    final glint = center + Offset(-14 + math.sin(t * .6) * 3, -16);
    canvas.drawCircle(
      glint,
      18,
      Paint()
        ..shader = RadialGradient(
          colors: [
            highlight.withValues(
              alpha: mode == AssistantLiveOrbMode.failed ? .12 : .32,
            ),
            highlight.withValues(alpha: 0),
          ],
        ).createShader(Rect.fromCircle(center: glint, radius: 18)),
    );
  }

  @override
  bool shouldRepaint(_OrbPainter oldDelegate) =>
      oldDelegate.motion != motion ||
      oldDelegate.mode != mode ||
      oldDelegate.highlight != highlight ||
      !listEquals(oldDelegate.spectrum, spectrum) ||
      !listEquals(oldDelegate.colors, colors);
}
