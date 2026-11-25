import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:mobile/core/responsive/breakpoints.dart';

/// Window text sizing follows the compact (1.0×), medium (1.06×), expanded
/// (1.12×), and 1680dp-and-up (1.18×) steps.
abstract final class AppWindowScale {
  static const double _wideMinWidth = 1680;
  static const double _maxTextScale = 2;

  static double textFactor(double width) =>
      switch (Breakpoints.fromWidth(width)) {
        DeviceClass.compact => 1,
        DeviceClass.medium => 1.06,
        DeviceClass.expanded => width >= _wideMinWidth ? 1.18 : 1.12,
      };

  /// Multiplies the platform's per-size result by the window and user
  /// factors, capping the combined result at twice the unscaled font size.
  static TextScaler textScaler({
    required double width,
    required double userFactor,
    required TextScaler platform,
  }) => _WindowTextScaler(platform, textFactor(width) * userFactor);
}

class _WindowTextScaler extends TextScaler {
  const _WindowTextScaler(this.platform, this.factor);

  final TextScaler platform;
  final double factor;

  @override
  double scale(double fontSize) => math.min(
    platform.scale(fontSize) * factor,
    fontSize * AppWindowScale._maxTextScale,
  );

  @override
  double get textScaleFactor => scale(1);

  @override
  bool operator ==(Object other) =>
      other is _WindowTextScaler &&
      other.platform == platform &&
      other.factor == factor;

  @override
  int get hashCode => Object.hash(platform, factor);
}
