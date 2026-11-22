import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';

/// Mirrors packages/ui/src/components/ui/custom/sorbet-theme.test.ts.
void main() {
  group('SorbetTheme.parse', () {
    test('returns the default for empty, malformed or oversized input', () {
      for (final raw in <Object?>[
        null,
        '',
        'not json',
        '[]',
        '"matcha"',
        '42',
        42,
        jsonEncode({'preset': 'matcha', 'pad': 'x' * 600}),
      ]) {
        expect(SorbetTheme.parse(raw), const SorbetTheme(), reason: '$raw');
      }
    });

    test('keeps allowlisted values and resets the rest field by field', () {
      expect(
        SorbetTheme.parse(
          jsonEncode({
            'preset': 'high-contrast',
            'accent': '#ABCDEF',
            'radius': 'round',
            'density': 'huge',
            'font': 'comic',
            'extra': 'dropped',
          }),
        ),
        const SorbetTheme(
          preset: SorbetPreset.highContrast,
          accent: '#abcdef',
          radius: SorbetRadius.round,
        ),
      );
    });

    test('rejects an invalid preset and accepts a decoded object', () {
      expect(
        SorbetTheme.parse(const {'preset': 'banana', 'font': 'system'}),
        const SorbetTheme(font: SorbetFont.system),
      );
      expect(
        SorbetTheme.parse(const {'preset': 'highContrast'}).preset,
        SorbetPreset.sorbet,
      );
    });

    test('rejects anything but a six-digit hex accent', () {
      for (final accent in <Object?>[
        'red',
        '#fff',
        '#12345678',
        'url(x)',
        '#12345g',
        '#123456;color:red',
        'var(--x)',
        42,
      ]) {
        expect(parseSorbetAccent(accent), isNull, reason: '$accent');
      }
      expect(parseSorbetAccent(' #A1B2C3 '), '#a1b2c3');
    });
  });

  test('serializes known fields in a fixed order', () {
    expect(
      const SorbetTheme(
        font: SorbetFont.system,
        preset: SorbetPreset.lagoon,
        density: SorbetDensity.compact,
        radius: SorbetRadius.sharp,
      ).serialize(),
      '{"preset":"lagoon","accent":null,"radius":"sharp",'
      '"density":"compact","font":"system"}',
    );
    const custom = SorbetTheme(
      preset: SorbetPreset.highContrast,
      accent: '#0b3d91',
    );
    expect(SorbetTheme.parse(custom.serialize()), custom);
  });

  test('copyWith validates and clears the accent', () {
    const theme = SorbetTheme(accent: '#112233');
    expect(theme.copyWith(accent: () => 'nope').accent, isNull);
    expect(theme.copyWith(accent: () => null).accent, isNull);
    expect(theme.copyWith(accent: () => '#AABBCC').accent, '#aabbcc');
    expect(theme.copyWith(preset: SorbetPreset.rose).accent, '#112233');
  });

  test('Sorbet is on when unset and off only for an explicit opt-out', () {
    for (final value in <Object?>[null, '', 'true', true, 'TRUE', '1', 1]) {
      expect(parseSorbetEnabled(value), isTrue, reason: '$value');
    }
    expect(parseSorbetEnabled('false'), isFalse);
    expect(parseSorbetEnabled(false), isFalse);
  });

  test('the active theme is null while Sorbet is off', () {
    const theme = SorbetTheme(preset: SorbetPreset.mango);
    expect(const SorbetPreferences(theme: theme).active, theme);
    expect(
      const SorbetPreferences(enabled: false, theme: theme).active,
      isNull,
    );
  });
}
