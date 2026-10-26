import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';

/// How navigation and scrolling feel. Every style keeps the same colours,
/// layout and components on Android and iOS; [tuturuuu] is the default.
enum AppInterfaceStyle {
  /// Tuturuuu's own feel: each platform keeps its system navigation gesture.
  tuturuuu,

  /// Slide transitions and bouncing scroll edges on every platform.
  ios,

  /// Zoom transitions and stretching scroll edges on every platform. iOS
  /// keeps its edge-swipe Back, which the system owns.
  material,
}

/// Row height and gap scale for lists and grouped rows.
enum AppDensity { comfortable, compact }

/// Corner treatment for cards, sheets and grouped surfaces. Pills stay round.
enum AppCornerStyle { rounded, soft, square }

/// Interface choices from Appearance, published as a theme extension so
/// components read them through `AppTokens.of(context).interface` instead of
/// branching on the platform.
@immutable
class AppInterfaceTokens extends ThemeExtension<AppInterfaceTokens> {
  const AppInterfaceTokens({
    this.style = AppInterfaceStyle.tuturuuu,
    this.density = AppDensity.comfortable,
    this.corners = AppCornerStyle.rounded,
  });

  static const standard = AppInterfaceTokens();

  /// The smallest touch target any density may produce.
  static const double minTouchTarget = 44;

  final AppInterfaceStyle style;
  final AppDensity density;
  final AppCornerStyle corners;

  /// [base] radius under the chosen corner style. Pill radii are kept, and
  /// square corners stay slightly softened so edges do not alias.
  double radius(double base) {
    if (base >= AppRadius.pill) return base;
    return switch (corners) {
      AppCornerStyle.rounded => base,
      AppCornerStyle.soft => (base * 0.6).roundToDouble(),
      AppCornerStyle.square => math.min(base, 4),
    };
  }

  BorderRadius borderRadius(double base) => BorderRadius.circular(radius(base));

  /// Minimum height of a grouped row; never below [minTouchTarget].
  double get rowMinHeight => switch (density) {
    AppDensity.comfortable => AppLayout.rowMinHeight,
    AppDensity.compact => AppLayout.rowCompactMinHeight,
  };

  /// Scroll physics for the style, or null to keep the platform default.
  ScrollPhysics? get scrollPhysics => switch (style) {
    AppInterfaceStyle.tuturuuu => null,
    AppInterfaceStyle.ios => const BouncingScrollPhysics(),
    AppInterfaceStyle.material => const ClampingScrollPhysics(),
  };

  @override
  AppInterfaceTokens copyWith({
    AppInterfaceStyle? style,
    AppDensity? density,
    AppCornerStyle? corners,
  }) => AppInterfaceTokens(
    style: style ?? this.style,
    density: density ?? this.density,
    corners: corners ?? this.corners,
  );

  // Discrete choices do not interpolate; the theme switches at the midpoint.
  @override
  AppInterfaceTokens lerp(AppInterfaceTokens? other, double t) =>
      other == null || t < 0.5 ? this : other;

  @override
  bool operator ==(Object other) =>
      other is AppInterfaceTokens &&
      other.style == style &&
      other.density == density &&
      other.corners == corners;

  @override
  int get hashCode => Object.hash(style, density, corners);
}
