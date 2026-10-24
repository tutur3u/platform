import 'dart:convert';

import 'package:equatable/equatable.dart';

/// Curated background themes. Colour values live in `appearance_palettes.dart`.
enum AppearanceThemeId {
  classic,
  aurora,
  sunset,
  ocean,
  forest,
  ember,
  blossom,
  mono,
}

/// Accent colour applied to primary controls. [theme] follows the selected
/// background theme's recommended accent.
enum AppearanceAccentId {
  theme,
  neutral,
  indigo,
  blue,
  teal,
  green,
  amber,
  orange,
  rose,
  violet,
}

/// How the app-wide page background is painted.
enum AppearanceBackgroundStyle { solid, gradient, blobs }

/// Persisted appearance customisation, excluding light/dark/system mode which
/// keeps its original `theme-mode` preference for backward compatibility.
class AppearanceSettings extends Equatable {
  const AppearanceSettings({
    this.theme = AppearanceThemeId.classic,
    this.accent = AppearanceAccentId.theme,
    this.backgroundStyle = AppearanceBackgroundStyle.solid,
    this.intensity = defaultIntensity,
    this.softness = defaultSoftness,
    this.surfaceOpacity = defaultSurfaceOpacity,
    this.animate = false,
  });

  /// Decodes a stored payload. Unknown or malformed values fall back to the
  /// defaults field by field, so a newer or corrupted payload never crashes.
  factory AppearanceSettings.decode(String? raw) {
    if (raw == null || raw.trim().isEmpty) return const AppearanceSettings();
    try {
      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic>) return const AppearanceSettings();
      return AppearanceSettings.fromJson(json);
    } on FormatException {
      return const AppearanceSettings();
    }
  }

  factory AppearanceSettings.fromJson(Map<String, dynamic> json) {
    T pick<T extends Enum>(List<T> values, Object? name, T fallback) {
      for (final value in values) {
        if (value.name == name) return value;
      }
      return fallback;
    }

    double unit(Object? value, double fallback, {double min = 0}) {
      if (value is! num || !value.isFinite) return fallback;
      return value.toDouble().clamp(min, 1).toDouble();
    }

    return AppearanceSettings(
      theme: pick(
        AppearanceThemeId.values,
        json['theme'],
        AppearanceThemeId.classic,
      ),
      accent: pick(
        AppearanceAccentId.values,
        json['accent'],
        AppearanceAccentId.theme,
      ),
      backgroundStyle: pick(
        AppearanceBackgroundStyle.values,
        json['background'],
        AppearanceBackgroundStyle.solid,
      ),
      intensity: unit(json['intensity'], defaultIntensity),
      softness: unit(json['softness'], defaultSoftness),
      surfaceOpacity: unit(
        json['surfaceOpacity'],
        defaultSurfaceOpacity,
        min: minSurfaceOpacity,
      ),
      animate: json['animate'] == true,
    );
  }

  static const defaultIntensity = 0.6;
  static const defaultSoftness = 0.6;
  static const defaultSurfaceOpacity = 0.78;
  static const minSurfaceOpacity = 0.4;

  final AppearanceThemeId theme;
  final AppearanceAccentId accent;
  final AppearanceBackgroundStyle backgroundStyle;

  /// Strength of the gradient or blobs, from subtle (0) to vivid (1).
  final double intensity;

  /// Blob spread: tighter shapes (0) to wide, diffuse glows (1). This is a
  /// radial falloff, not an image blur, so it costs no extra GPU passes.
  final double softness;

  /// Opacity of grouped cards drawn above an ambient background.
  final double surfaceOpacity;

  /// Opt-in slow drift for blob backgrounds. Reduced motion always wins.
  final bool animate;

  /// Whether pages show a painted gradient or blob layer.
  bool get hasAmbientBackground =>
      backgroundStyle != AppearanceBackgroundStyle.solid;

  bool get isDefault => this == const AppearanceSettings();

  AppearanceSettings copyWith({
    AppearanceThemeId? theme,
    AppearanceAccentId? accent,
    AppearanceBackgroundStyle? backgroundStyle,
    double? intensity,
    double? softness,
    double? surfaceOpacity,
    bool? animate,
  }) => AppearanceSettings(
    theme: theme ?? this.theme,
    accent: accent ?? this.accent,
    backgroundStyle: backgroundStyle ?? this.backgroundStyle,
    intensity: (intensity ?? this.intensity).clamp(0, 1).toDouble(),
    softness: (softness ?? this.softness).clamp(0, 1).toDouble(),
    surfaceOpacity: (surfaceOpacity ?? this.surfaceOpacity)
        .clamp(minSurfaceOpacity, 1)
        .toDouble(),
    animate: animate ?? this.animate,
  );

  Map<String, Object> toJson() => {
    'version': 1,
    'theme': theme.name,
    'accent': accent.name,
    'background': backgroundStyle.name,
    'intensity': intensity,
    'softness': softness,
    'surfaceOpacity': surfaceOpacity,
    'animate': animate,
  };

  String encode() => jsonEncode(toJson());

  @override
  List<Object?> get props => [
    theme,
    accent,
    backgroundStyle,
    intensity,
    softness,
    surfaceOpacity,
    animate,
  ];
}
