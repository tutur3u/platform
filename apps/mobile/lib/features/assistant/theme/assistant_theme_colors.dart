import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';

@immutable
class AssistantMessageColors {
  const AssistantMessageColors({
    required this.background,
    required this.foreground,
    required this.mutedForeground,
  });

  final Color background;
  final Color foreground;
  final Color mutedForeground;
}

/// All colors derive from the shared appearance palette, for either brightness.
@immutable
class AssistantThemeColors {
  const AssistantThemeColors._({
    required this.backgroundColors,
    required this.backgroundStyle,
    required this.foreground,
    required this.mutedForeground,
    required this.userMessage,
    required this.assistantMessage,
  });

  factory AssistantThemeColors.resolve(
    AssistantThemePreferences value,
    Brightness brightness,
  ) {
    final background = AppearancePalettes.of(
      value.backgroundTheme,
    ).tones(brightness);
    final palette = AppearancePalettes.of(value.messageTheme);
    final message = palette.tones(brightness);
    final intensity = value.intensity.isFinite
        ? value.intensity.clamp(0, 1).toDouble()
        : AssistantThemePreferences.defaultIntensity;
    final stops = switch (value.backgroundStyle) {
      AssistantBackgroundStyle.solid => [background.base],
      AssistantBackgroundStyle.gradient => [
        background.gradient.first,
        background.gradient.last,
      ],
      AssistantBackgroundStyle.ombre => background.gradient,
    };
    final colors = stops
        .map((stop) => Color.lerp(background.base, stop, intensity)!)
        .toList(growable: false);
    final accent = value.textAccent == AppearanceAccentId.theme
        ? palette.accent
        : value.textAccent;
    final seed = accent == AppearanceAccentId.neutral
        ? message.foreground
        : AppearancePalettes.accents[accent]!.resolve(brightness);
    // This per-channel bound also covers every interpolated gradient color.
    final bound = AppearanceContrast.channelBound(
      colors,
      lightest: brightness == Brightness.dark,
    );
    Color readable(Color color, Color against) =>
        AppearanceContrast.ensureContrast(
          color,
          against: against,
          target: AppearanceContrast.aaText,
        );
    AssistantMessageColors bubble(Color fill) => AssistantMessageColors(
      background: fill,
      foreground: readable(seed, fill),
      mutedForeground: readable(message.muted, fill),
    );
    return AssistantThemeColors._(
      backgroundColors: List.unmodifiable(colors),
      backgroundStyle: value.backgroundStyle,
      foreground: readable(seed, bound),
      mutedForeground: readable(background.muted, bound),
      userMessage: bubble(
        Color.lerp(message.base, message.gradient.first, 0.8)!,
      ),
      assistantMessage: bubble(message.base),
    );
  }

  final List<Color> backgroundColors;
  final AssistantBackgroundStyle backgroundStyle;
  final Color foreground;
  final Color mutedForeground;
  final AssistantMessageColors userMessage;
  final AssistantMessageColors assistantMessage;

  BoxDecoration get backgroundDecoration => BoxDecoration(
    color: backgroundColors.first,
    gradient: backgroundColors.length < 2
        ? null
        : LinearGradient(
            begin: backgroundStyle == AssistantBackgroundStyle.ombre
                ? Alignment.topCenter
                : Alignment.topLeft,
            end: backgroundStyle == AssistantBackgroundStyle.ombre
                ? Alignment.bottomCenter
                : Alignment.bottomRight,
            colors: backgroundColors,
          ),
  );
}
