import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';

/// Paints the ombre gradient or soft blob layer for an appearance.
///
/// The layer sits in its own [RepaintBoundary]. Static backgrounds rasterise
/// once; an animated blob layer repaints only its painter from [motion], so no
/// widget above it rebuilds per tick.
class AmbientBackground extends StatelessWidget {
  const AmbientBackground({
    required this.settings,
    required this.brightness,
    this.motion,
    super.key,
  });

  final AppearanceSettings settings;
  final Brightness brightness;

  /// Loop phase in `[0, 1)`; `null` paints the static rest pose.
  final ValueListenable<double>? motion;

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: CustomPaint(
      key: const ValueKey('appearance-ambient-background'),
      isComplex: true,
      willChange: motion != null,
      painter: AmbientPainter(
        settings: settings,
        brightness: brightness,
        motion: motion,
      ),
      child: const SizedBox.expand(),
    ),
  );
}

class AmbientPainter extends CustomPainter {
  AmbientPainter({
    required this.settings,
    required this.brightness,
    this.motion,
  }) : super(repaint: motion);

  final AppearanceSettings settings;
  final Brightness brightness;
  final ValueListenable<double>? motion;

  // Normalised blob anchors and drift directions, largest blob first.
  static const _anchors = [
    Offset(0.12, 0.08),
    Offset(0.92, 0.42),
    Offset(0.3, 0.95),
  ];
  static const _drift = [
    Offset(0.08, 0.05),
    Offset(-0.06, 0.07),
    Offset(0.07, -0.05),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final tones = AppearancePalettes.of(settings.theme).tones(brightness);
    final rect = Offset.zero & size;
    canvas.drawRect(rect, Paint()..color = tones.base);
    final strength = settings.intensity.clamp(0.0, 1.0);
    switch (settings.backgroundStyle) {
      case AppearanceBackgroundStyle.solid:
        return;
      case AppearanceBackgroundStyle.gradient:
        _paintGradient(canvas, rect, tones.gradient, 0.35 + 0.65 * strength);
      case AppearanceBackgroundStyle.blobs:
        _paintGradient(canvas, rect, tones.gradient, 0.2 + 0.3 * strength);
        _paintBlobs(canvas, size, tones.blobs, 0.4 + 0.6 * strength);
    }
  }

  void _paintGradient(Canvas canvas, Rect rect, List<Color> stops, double a) {
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [for (final stop in stops) stop.withValues(alpha: a)],
        ).createShader(rect),
    );
  }

  void _paintBlobs(Canvas canvas, Size size, List<Color> blobs, double a) {
    final phase = (motion?.value ?? 0) * 2 * math.pi;
    final spread = 0.42 + 0.36 * settings.softness.clamp(0.0, 1.0);
    final longest = size.longestSide;
    for (var i = 0; i < blobs.length && i < _anchors.length; i++) {
      final anchor = _anchors[i];
      final drift = _drift[i];
      final center = Offset(
        (anchor.dx + drift.dx * math.sin(phase + i * 2.1)) * size.width,
        (anchor.dy + drift.dy * math.cos(phase + i * 1.7)) * size.height,
      );
      final radius = longest * spread * (1 - i * 0.12);
      final color = blobs[i];
      final circle = Rect.fromCircle(center: center, radius: radius);
      canvas.drawCircle(
        center,
        radius,
        Paint()
          ..shader = RadialGradient(
            colors: [
              color.withValues(alpha: a),
              color.withValues(alpha: a * 0.45),
              color.withValues(alpha: 0),
            ],
            stops: const [0, 0.45, 1],
          ).createShader(circle),
      );
    }
  }

  @override
  bool shouldRepaint(AmbientPainter oldDelegate) =>
      oldDelegate.settings != settings ||
      oldDelegate.brightness != brightness ||
      oldDelegate.motion != motion;
}

/// Low-cost blob drift clock: a 15 fps timer advancing one slow loop. Frames
/// are scheduled only when the phase changes, unlike a vsync ticker. Pausing
/// resumes from the same phase.
class AmbientMotionClock extends ChangeNotifier
    implements ValueListenable<double> {
  AmbientMotionClock({this.period = const Duration(seconds: 48)});

  static const step = Duration(milliseconds: 66);

  final Duration period;
  Timer? _timer;
  double _value = 0;

  @override
  double get value => _value;

  bool get isRunning => _timer != null;

  void start() {
    if (_timer != null) return;
    final increment = step.inMicroseconds / period.inMicroseconds;
    _timer = Timer.periodic(step, (_) {
      _value = (_value + increment) % 1;
      notifyListeners();
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}
