import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palettes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';

/// The shared web sources the Dart mirror must match.
Directory _uiSource() {
  var dir = Directory.current.absolute;
  while (true) {
    final candidate = Directory('${dir.path}/packages/ui/src');
    if (File('${candidate.path}/sorbet.css').existsSync()) return candidate;
    final parent = dir.parent;
    if (parent.path == dir.path) {
      fail('packages/ui/src/sorbet.css not found above ${Directory.current}');
    }
    dir = parent;
  }
}

/// CSS rule blocks as selector → custom properties, comments removed.
/// Nested at-rule wrappers are skipped; their inner rules still parse.
Map<String, Map<String, String>> _blocks(String css) {
  final clean = css.replaceAll(RegExp(r'/\*.*?\*/', dotAll: true), '');
  final result = <String, Map<String, String>>{};
  for (final m in RegExp(r'([^{}]+)\{([^{}]*)\}').allMatches(clean)) {
    final selector = m.group(1)!.split(RegExp(r'\s+')).join(' ').trim();
    // A selector repeated later (for example inside a media query) only
    // adds properties; the first declaration of each one stands.
    final block = result.putIfAbsent(selector, () => {});
    for (final d in RegExp(r'--([\w-]+):\s*([^;]+);').allMatches(m.group(2)!)) {
      block.putIfAbsent(d.group(1)!, () => d.group(2)!.trim());
    }
  }
  return result;
}

Color _css(String value) {
  final hex = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(value);
  if (hex != null) return Color(0xFF000000 | int.parse(hex[1]!, radix: 16));
  final rgba = RegExp(r'^rgba\(([^)]*)\)$').firstMatch(value);
  if (rgba == null) fail('Unsupported colour "$value"');
  final parts = rgba[1]!.split(',').map((p) => p.trim()).toList();
  return Color.fromRGBO(
    int.parse(parts[0]),
    int.parse(parts[1]),
    int.parse(parts[2]),
    double.parse(parts[3]),
  );
}

String _hex(Color c) =>
    '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}'
    '${c.a < 1 ? ' @${c.a.toStringAsFixed(3)}' : ''}';

/// Same RGB, and alpha within one 8-bit step.
void _expectColor(Color actual, String css, String where) {
  final expected = _css(css);
  final same =
      (actual.toARGB32() & 0xFFFFFF) == (expected.toARGB32() & 0xFFFFFF) &&
      (actual.a - expected.a).abs() <= 1 / 255 + 1e-9;
  expect(
    same,
    isTrue,
    reason:
        'Sorbet drift at $where: Dart ${_hex(actual)}, web $css. '
        'Regenerate sorbet_palettes.dart with '
        'apps/mobile/tool/generate_sorbet_palettes.py.',
  );
}

void main() {
  final ui = _uiSource();
  final sorbet = _blocks(File('${ui.path}/sorbet.css').readAsStringSync());
  final presets = _blocks(
    File('${ui.path}/sorbet-presets.css').readAsStringSync(),
  );
  final tokens =
      jsonDecode(File('${ui.path}/sorbet-tokens.json').readAsStringSync())
          as Map<String, dynamic>;

  group('sorbet-presets.css', () {
    for (final preset in SorbetPreset.values) {
      for (final b in Brightness.values) {
        test('${preset.id} ${b.name} source colours', () {
          final selector = b == Brightness.dark
              ? '[data-sorbet-preview="${preset.id}"]'
                    '[data-sorbet-preview-mode="dark"]'
              : '[data-sorbet-preview="${preset.id}"]';
          final block = presets.entries
              .firstWhere(
                (e) => e.key.endsWith(selector) && e.value.isNotEmpty,
                orElse: () => fail('No CSS block for $selector'),
              )
              .value;
          final source = SorbetPalettes.source(preset, b).byCssName;
          for (final entry in source.entries) {
            final css = block['sorbet-${entry.key}'];
            expect(css, isNotNull, reason: '$selector lacks ${entry.key}');
            _expectColor(
              entry.value,
              css!,
              '${preset.id}/${b.name}/${entry.key}',
            );
          }
          // High Contrast also overrides the status inks.
          final hues = SorbetPalettes.hues(preset, b).byName;
          for (final hue in hues.entries) {
            final override = block[hue.key];
            if (override != null) {
              _expectColor(hue.value.ink, override, '${preset.id}/${hue.key}');
            }
          }
          if (preset == SorbetPreset.highContrast) {
            expect(block.keys, containsAll(hues.keys));
          }
        });
      }
    }
  });

  group('sorbet.css', () {
    for (final b in Brightness.values) {
      test('default ${b.name} roles, inks and calm fills', () {
        final block =
            sorbet[b == Brightness.dark
                ? ':root[data-ui="sorbet"].dark'
                : ':root[data-ui="sorbet"]']!;
        final roles = SorbetPalettes.defaultRoles(b);
        final mapping = {
          'root-background': roles.ground,
          'background': roles.background,
          'foreground': roles.foreground,
          'card': roles.surface,
          'popover': roles.surface,
          'primary': roles.primary,
          'primary-foreground': roles.primaryForeground,
          'secondary': roles.surfaceSunken,
          'muted': roles.surfaceSunken,
          'muted-foreground': roles.mutedForeground,
          'accent': roles.accent,
          'destructive': roles.destructive,
          'destructive-foreground': roles.destructiveForeground,
          'border': roles.border,
          'input': roles.borderStrong,
          'ring': roles.ring,
        };
        for (final entry in mapping.entries) {
          _expectColor(
            entry.value,
            block[entry.key]!,
            'sorbet.css ${entry.key}',
          );
        }
        final hues = SorbetPalettes.hues(SorbetPreset.sorbet, b).byName;
        for (final hue in hues.entries) {
          _expectColor(
            hue.value.ink,
            block[hue.key]!,
            'sorbet.css --${hue.key}',
          );
          final calm = hue.key == 'teal' ? 'cyan' : hue.key;
          _expectColor(
            hue.value.calm,
            block['calendar-bg-$calm']!,
            'sorbet.css --calendar-bg-$calm',
          );
        }
      });
    }
  });

  group('sorbet-tokens.json', () {
    for (final b in Brightness.values) {
      test('default ${b.name} roles and hues', () {
        final color = (tokens['color'] as Map)[b.name] as Map;
        final roles = SorbetPalettes.defaultRoles(b).byJsonName;
        expect(roles.keys.toSet(), color.keys.toSet());
        for (final entry in roles.entries) {
          _expectColor(
            entry.value,
            color[entry.key] as String,
            'color.${b.name}.${entry.key}',
          );
        }
        final hues = tokens['hues'] as Map;
        final dart = SorbetPalettes.hues(SorbetPreset.sorbet, b).byName;
        expect(dart.keys.toSet(), hues.keys.toSet());
        for (final entry in dart.entries) {
          final json = (hues[entry.key] as Map)[b.name] as Map;
          final where = 'hues.${entry.key}.${b.name}';
          _expectColor(entry.value.fill, json['fill'] as String, '$where.fill');
          _expectColor(entry.value.calm, json['calm'] as String, '$where.calm');
          _expectColor(entry.value.ink, json['ink'] as String, '$where.ink');
        }
      });
    }

    test('radius, space, motion, controls and mobile metrics', () {
      final radius = tokens['radius'] as Map;
      final soft = SorbetRadii.of(SorbetRadius.soft);
      expect(
        [soft.small, soft.control, soft.card, soft.panel, soft.full],
        [
          radius['sm'],
          radius['md'],
          radius['lg'],
          radius['xl'],
          radius['full'],
        ],
      );
      final popover = radius['popover'] as Map;
      for (final option in SorbetRadius.values) {
        expect(SorbetRadii.of(option).popover, popover[option.name]);
      }

      expect(
        SorbetTokens.defaultSpace,
        (tokens['space'] as Map).values.toList(),
      );

      final durations = (tokens['motion'] as Map)['duration'] as Map;
      const motion = SorbetMotion();
      expect(
        [
          motion.instant,
          motion.fast,
          motion.base,
          motion.slow,
          motion.sheet,
        ].map((d) => d.inMilliseconds),
        [
          durations['instant'],
          durations['fast'],
          durations['base'],
          durations['slow'],
          durations['sheet'],
        ],
      );

      final control = tokens['control'] as Map;
      for (final density in SorbetDensity.values) {
        final sizes = SorbetControlSizes.of(density);
        final json = control[density.name] as Map;
        expect(
          [sizes.xs, sizes.sm, sizes.md, sizes.lg],
          [json['xs'], json['sm'], json['md'], json['lg']],
          reason: 'control.${density.name}',
        );
      }

      final mobile = tokens['mobile'] as Map;
      const metrics = SorbetMetrics();
      final handle = mobile['sheetHandle'] as Map;
      expect(
        {
          'touchTarget': metrics.touchTarget,
          'inputFontSize': metrics.inputFontSize,
          'gutter': metrics.gutter,
          'headerHeight': metrics.headerHeight,
          'dockHeight': metrics.dockHeight,
          'dockInset': metrics.dockInset,
          'dockRadius': metrics.dockRadius,
          'sheetRadius': metrics.sheetRadius,
          'listRowMinHeight': metrics.listRowMinHeight,
          'sheetHandleWidth': metrics.sheetHandle.width,
          'sheetHandleHeight': metrics.sheetHandle.height,
        },
        {
          for (final key in [
            'touchTarget',
            'inputFontSize',
            'gutter',
            'headerHeight',
            'dockHeight',
            'dockInset',
            'dockRadius',
            'sheetRadius',
            'listRowMinHeight',
          ])
            key: (mobile[key] as num).toDouble(),
          'sheetHandleWidth': (handle['width'] as num).toDouble(),
          'sheetHandleHeight': (handle['height'] as num).toDouble(),
        },
      );
    });

    test('theme allowlists match', () {
      final fields =
          (tokens['setting'] as Map)['themeFields'] as Map<String, dynamic>;
      expect(SorbetPreset.values.map((p) => p.id), fields['preset']);
      expect(SorbetRadius.values.map((r) => r.name), fields['radius']);
      expect(SorbetDensity.values.map((d) => d.name), fields['density']);
      expect(SorbetFont.values.map((f) => f.name), fields['font']);
      final setting = tokens['setting'] as Map;
      expect(setting['enabledConfigId'], SorbetConfigIds.enabled);
      expect(setting['themeConfigId'], SorbetConfigIds.theme);
    });
  });
}
