import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palettes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_scales.dart';
import 'package:mobile/core/ui/tokens/app_typography.dart';

export 'package:mobile/core/theme/sorbet/sorbet_scales.dart';

/// Bundled font families (`type.families`). The `font` setting swaps the
/// sans family only.
abstract final class SorbetFonts {
  static const nunito = 'Nunito';
  static const noto = 'NotoSans';
  static const mono = 'JetBrainsMono';

  /// The sans family for [font], or null for the platform default.
  static String? sans(SorbetFont font) => switch (font) {
    SorbetFont.nunito => nunito,
    SorbetFont.noto => noto,
    SorbetFont.system => null,
  };
}

/// Sorbet-only design tokens, carried by the Sorbet Material theme. Classic
/// themes do not carry it, so [maybeOf] returns null outside Sorbet.
@immutable
class SorbetTokens extends ThemeExtension<SorbetTokens> {
  const SorbetTokens({
    required this.hues,
    required this.ground,
    required this.background,
    required this.surface,
    required this.ring,
    required this.scrim,
    required this.hover,
    required this.navSelectedFill,
    required this.navSelectedInk,
    required this.dockSurface,
    required this.skeleton,
    required this.fieldStroke,
    required this.radii,
    required this.controls,
    this.eventTone = SorbetHueTone.calm,
    this.tagTone = SorbetHueTone.fill,
    this.focus = const SorbetFocusRing(),
    this.typography = const AppTypography(
      fontFamily: SorbetFonts.nunito,
      monoFamily: SorbetFonts.mono,
      scale: AppTypeScale.sorbet,
    ),
    this.shadows = SorbetShadows.light,
    this.space = defaultSpace,
    this.motion = const SorbetMotion(),
    this.metrics = const SorbetMetrics(),
  });

  /// Tokens for [theme] in [brightness]; [ring] is the resolved focus ring,
  /// which follows a custom accent.
  factory SorbetTokens.resolve(
    SorbetTheme theme,
    Brightness brightness, {
    required Color ring,
  }) {
    final roles = SorbetPalettes.roles(theme.preset, brightness);
    return SorbetTokens(
      hues: SorbetPalettes.hues(theme.preset, brightness),
      ground: roles.ground,
      background: roles.background,
      surface: roles.surface,
      ring: ring,
      scrim: roles.scrim,
      hover: roles.hover,
      navSelectedFill: roles.accent,
      navSelectedInk: roles.foreground,
      dockSurface: roles.surface,
      skeleton: roles.surfaceSunken,
      fieldStroke: roles.fieldStroke,
      radii: SorbetRadii.of(theme.radius),
      controls: SorbetControlSizes.of(theme.density),
      typography: AppTypography(
        fontFamily: SorbetFonts.sans(theme.font),
        monoFamily: SorbetFonts.mono,
        scale: AppTypeScale.sorbet,
      ),
      shadows: SorbetShadows.of(brightness),
    );
  }

  /// Spacing scale (`space`), smallest first.
  static const defaultSpace = <double>[2, 4, 6, 8, 12, 16, 20, 24, 32, 48];

  static SorbetTokens? maybeOf(BuildContext context) =>
      Theme.of(context).extension<SorbetTokens>();

  /// Status hues: pastel fills and their inks.
  final SorbetHues hues;
  final Color ground;
  final Color background;

  /// Cards and popovers.
  final Color surface;
  final Color ring;
  final Color scrim;
  final Color hover;

  /// Selected dock and navigation items (`roles.navSelectedFill`, the soft
  /// accent) and their label and icon (`roles.navSelectedInk`).
  final Color navSelectedFill;
  final Color navSelectedInk;

  /// The floating dock (`roles.dockSurface`).
  final Color dockSurface;

  /// Loading placeholders (`roles.skeleton`); they pulse once per
  /// [SorbetMotion.skeletonPulse] and stay static under reduced motion.
  final Color skeleton;

  /// Field outlines (inputs, code slots, checkboxes): about 3.6:1 against a
  /// field, where `borderStrong` is only 1.6:1.
  final Color fieldStroke;
  final SorbetRadii radii;
  final SorbetControlSizes controls;

  /// Hue variant for calendar event blocks (`roles.eventFill`).
  final SorbetHueTone eventTone;

  /// Hue variant for tags and status chips (`roles.tagFill`).
  final SorbetHueTone tagTone;
  final SorbetFocusRing focus;

  /// The contract type roles in the chosen sans family and the mono family.
  final AppTypography typography;
  final SorbetShadows shadows;
  final List<double> space;
  final SorbetMotion motion;
  final SorbetMetrics metrics;

  /// The fill of [hue] for an event block.
  Color eventFill(SorbetHue hue) => _tone(hue, eventTone);

  /// The fill of [hue] for a tag or status chip.
  Color tagFill(SorbetHue hue) => _tone(hue, tagTone);

  static Color _tone(SorbetHue hue, SorbetHueTone tone) => switch (tone) {
    SorbetHueTone.fill => hue.fill,
    SorbetHueTone.calm => hue.calm,
  };

  @override
  SorbetTokens copyWith({
    SorbetHues? hues,
    Color? ground,
    Color? background,
    Color? surface,
    Color? ring,
    Color? scrim,
    Color? hover,
    Color? navSelectedFill,
    Color? navSelectedInk,
    Color? dockSurface,
    Color? skeleton,
    Color? fieldStroke,
    SorbetRadii? radii,
    SorbetControlSizes? controls,
    SorbetHueTone? eventTone,
    SorbetHueTone? tagTone,
    SorbetFocusRing? focus,
    AppTypography? typography,
    SorbetShadows? shadows,
    List<double>? space,
    SorbetMotion? motion,
    SorbetMetrics? metrics,
  }) => SorbetTokens(
    hues: hues ?? this.hues,
    ground: ground ?? this.ground,
    background: background ?? this.background,
    surface: surface ?? this.surface,
    ring: ring ?? this.ring,
    scrim: scrim ?? this.scrim,
    hover: hover ?? this.hover,
    navSelectedFill: navSelectedFill ?? this.navSelectedFill,
    navSelectedInk: navSelectedInk ?? this.navSelectedInk,
    dockSurface: dockSurface ?? this.dockSurface,
    skeleton: skeleton ?? this.skeleton,
    fieldStroke: fieldStroke ?? this.fieldStroke,
    radii: radii ?? this.radii,
    controls: controls ?? this.controls,
    eventTone: eventTone ?? this.eventTone,
    tagTone: tagTone ?? this.tagTone,
    focus: focus ?? this.focus,
    typography: typography ?? this.typography,
    shadows: shadows ?? this.shadows,
    space: space ?? this.space,
    motion: motion ?? this.motion,
    metrics: metrics ?? this.metrics,
  );

  // Colours and radii interpolate; discrete scales switch at the midpoint.
  @override
  SorbetTokens lerp(SorbetTokens? other, double t) {
    if (other == null) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    final near = t < 0.5 ? this : other;
    return SorbetTokens(
      hues: SorbetHues.lerp(hues, other.hues, t),
      ground: mix(ground, other.ground),
      background: mix(background, other.background),
      surface: mix(surface, other.surface),
      ring: mix(ring, other.ring),
      scrim: mix(scrim, other.scrim),
      hover: mix(hover, other.hover),
      navSelectedFill: mix(navSelectedFill, other.navSelectedFill),
      navSelectedInk: mix(navSelectedInk, other.navSelectedInk),
      dockSurface: mix(dockSurface, other.dockSurface),
      skeleton: mix(skeleton, other.skeleton),
      fieldStroke: mix(fieldStroke, other.fieldStroke),
      radii: SorbetRadii.lerp(radii, other.radii, t),
      controls: near.controls,
      eventTone: near.eventTone,
      tagTone: near.tagTone,
      focus: near.focus,
      typography: near.typography,
      shadows: SorbetShadows.lerp(shadows, other.shadows, t),
      space: near.space,
      motion: near.motion,
      metrics: near.metrics,
    );
  }
}
