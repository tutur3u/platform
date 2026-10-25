import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';

enum AssistantBackgroundStyle { solid, gradient, ombre }

/// Device-local Assistant defaults shared by an actor's workspaces and chats.
class AssistantThemePreferences extends Equatable {
  const AssistantThemePreferences({
    this.messageTheme = AppearanceThemeId.classic,
    this.textAccent = AppearanceAccentId.neutral,
    this.backgroundTheme = AppearanceThemeId.classic,
    this.backgroundStyle = AssistantBackgroundStyle.solid,
    this.intensity = defaultIntensity,
  });

  factory AssistantThemePreferences.preset(AppearanceThemeId theme) =>
      AssistantThemePreferences(
        messageTheme: theme,
        backgroundTheme: theme,
        backgroundStyle: switch (AppearancePalettes.of(theme).preferredStyle) {
          AppearanceBackgroundStyle.solid => AssistantBackgroundStyle.solid,
          AppearanceBackgroundStyle.gradient =>
            AssistantBackgroundStyle.gradient,
          AppearanceBackgroundStyle.blobs => AssistantBackgroundStyle.ombre,
        },
      );

  factory AssistantThemePreferences.decode(String? raw) {
    if (raw == null || raw.length > 4096) {
      return const AssistantThemePreferences();
    }
    try {
      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic> ||
          json['version'] is! int ||
          json['version'] != 1) {
        return const AssistantThemePreferences();
      }
      T pick<T extends Enum>(List<T> values, Object? name, T fallback) =>
          values.where((value) => value.name == name).firstOrNull ?? fallback;
      final intensity = json['intensity'];
      return AssistantThemePreferences(
        messageTheme: pick(
          AppearanceThemeId.values,
          json['messageTheme'],
          AppearanceThemeId.classic,
        ),
        textAccent: pick(
          AppearanceAccentId.values,
          json['textAccent'],
          AppearanceAccentId.neutral,
        ),
        backgroundTheme: pick(
          AppearanceThemeId.values,
          json['backgroundTheme'],
          AppearanceThemeId.classic,
        ),
        backgroundStyle: pick(
          AssistantBackgroundStyle.values,
          json['backgroundStyle'],
          AssistantBackgroundStyle.solid,
        ),
        intensity: intensity is num && intensity.isFinite
            ? intensity.toDouble().clamp(0, 1).toDouble()
            : defaultIntensity,
      );
    } on FormatException {
      return const AssistantThemePreferences();
    }
  }

  static const defaultIntensity = 0.6;

  final AppearanceThemeId messageTheme;
  final AppearanceAccentId textAccent;
  final AppearanceThemeId backgroundTheme;
  final AssistantBackgroundStyle backgroundStyle;
  final double intensity;

  AssistantThemePreferences copyWith({
    AppearanceThemeId? messageTheme,
    AppearanceAccentId? textAccent,
    AppearanceThemeId? backgroundTheme,
    AssistantBackgroundStyle? backgroundStyle,
    double? intensity,
  }) => AssistantThemePreferences(
    messageTheme: messageTheme ?? this.messageTheme,
    textAccent: textAccent ?? this.textAccent,
    backgroundTheme: backgroundTheme ?? this.backgroundTheme,
    backgroundStyle: backgroundStyle ?? this.backgroundStyle,
    intensity: intensity == null || !intensity.isFinite
        ? this.intensity
        : intensity.clamp(0, 1).toDouble(),
  );

  String encode() => jsonEncode({
    'version': 1,
    'messageTheme': messageTheme.name,
    'textAccent': textAccent.name,
    'backgroundTheme': backgroundTheme.name,
    'backgroundStyle': backgroundStyle.name,
    'intensity': intensity.isFinite
        ? intensity.clamp(0, 1).toDouble()
        : defaultIntensity,
  });

  @override
  List<Object> get props => [
    messageTheme,
    textAccent,
    backgroundTheme,
    backgroundStyle,
    intensity,
  ];
}
