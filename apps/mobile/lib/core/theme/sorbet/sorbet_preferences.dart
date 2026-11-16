import 'dart:convert';

import 'package:equatable/equatable.dart';

/// Palette presets, in the order of `SORBET_PRESETS` in
/// `packages/ui/src/components/ui/custom/sorbet-theme.ts`. [id] is the
/// stored value and the CSS preset name.
enum SorbetPreset {
  sorbet('sorbet'),
  matcha('matcha'),
  blueberry('blueberry'),
  mango('mango'),
  lavender('lavender'),
  lagoon('lagoon'),
  rose('rose'),
  graphite('graphite'),
  midnight('midnight'),
  highContrast('high-contrast');

  const SorbetPreset(this.id);

  final String id;
}

/// Corner option: soft is the default 12/18/24 scale.
enum SorbetRadius { soft, sharp, round }

enum SorbetDensity { comfortable, compact, spacious }

enum SorbetFont { nunito, noto, system }

/// Account config ids shared with the web apps.
abstract final class SorbetConfigIds {
  static const enabled = 'EXPERIMENTAL_SORBET_UI';
  static const theme = 'SORBET_THEME';
}

final _hexColor = RegExp(r'^#[0-9a-f]{6}$');

/// A custom accent as lowercase `#rrggbb`, or null for anything else.
String? parseSorbetAccent(Object? value) {
  if (value is! String) return null;
  final normalized = value.trim().toLowerCase();
  return _hexColor.hasMatch(normalized) ? normalized : null;
}

/// The stored opt-in: only `true` or `'true'` enables Sorbet.
bool parseSorbetEnabled(Object? value) => value == true || value == 'true';

/// The Sorbet look options, parsed and serialized exactly like
/// `parseSorbetTheme` / `serializeSorbetTheme` on the web.
class SorbetTheme extends Equatable {
  const SorbetTheme({
    this.preset = SorbetPreset.sorbet,
    this.accent,
    this.radius = SorbetRadius.soft,
    this.density = SorbetDensity.comfortable,
    this.font = SorbetFont.nunito,
  });

  /// Reads a stored string or decoded object. Unknown fields are dropped and
  /// invalid values fall back to the default field by field; empty,
  /// oversized or malformed input returns the default theme.
  factory SorbetTheme.parse(Object? raw) {
    var value = raw;
    if (value is String) {
      if (value.isEmpty || value.length > maxStoredLength) {
        return const SorbetTheme();
      }
      try {
        value = jsonDecode(value);
      } on FormatException {
        return const SorbetTheme();
      }
    }
    if (value is! Map) return const SorbetTheme();

    T pick<T>(List<T> values, String Function(T) id, Object? input, T dflt) {
      for (final candidate in values) {
        if (id(candidate) == input) return candidate;
      }
      return dflt;
    }

    return SorbetTheme(
      preset: pick(
        SorbetPreset.values,
        (p) => p.id,
        value['preset'],
        SorbetPreset.sorbet,
      ),
      accent: parseSorbetAccent(value['accent']),
      radius: pick(
        SorbetRadius.values,
        (r) => r.name,
        value['radius'],
        SorbetRadius.soft,
      ),
      density: pick(
        SorbetDensity.values,
        (d) => d.name,
        value['density'],
        SorbetDensity.comfortable,
      ),
      font: pick(
        SorbetFont.values,
        (f) => f.name,
        value['font'],
        SorbetFont.nunito,
      ),
    );
  }

  /// Longest stored value accepted; a valid theme is far shorter.
  static const maxStoredLength = 512;

  final SorbetPreset preset;

  /// Custom accent as `#rrggbb`, or null for the preset's accent.
  final String? accent;
  final SorbetRadius radius;
  final SorbetDensity density;
  final SorbetFont font;

  bool get isDefault => this == const SorbetTheme();

  SorbetTheme copyWith({
    SorbetPreset? preset,
    String? Function()? accent,
    SorbetRadius? radius,
    SorbetDensity? density,
    SorbetFont? font,
  }) => SorbetTheme(
    preset: preset ?? this.preset,
    accent: accent == null ? this.accent : parseSorbetAccent(accent()),
    radius: radius ?? this.radius,
    density: density ?? this.density,
    font: font ?? this.font,
  );

  /// Compact JSON with the known fields in a fixed order.
  String serialize() => jsonEncode({
    'preset': preset.id,
    'accent': parseSorbetAccent(accent),
    'radius': radius.name,
    'density': density.name,
    'font': font.name,
  });

  @override
  List<Object?> get props => [preset, accent, radius, density, font];
}

/// The opt-in and its look, as one value for caching and state.
class SorbetPreferences extends Equatable {
  const SorbetPreferences({
    this.enabled = false,
    this.theme = const SorbetTheme(),
  });

  final bool enabled;
  final SorbetTheme theme;

  /// The active theme, or null while Sorbet is off.
  SorbetTheme? get active => enabled ? theme : null;

  SorbetPreferences copyWith({bool? enabled, SorbetTheme? theme}) =>
      SorbetPreferences(
        enabled: enabled ?? this.enabled,
        theme: theme ?? this.theme,
      );

  @override
  List<Object?> get props => [enabled, theme];
}
