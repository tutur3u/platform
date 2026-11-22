import 'dart:io';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palettes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';

import 'sorbet_parity_support.dart';

void main() {
  final ui = sorbetUiSource();
  final sorbet = sorbetCssBlocks(
    File('${ui.path}/sorbet.css').readAsStringSync(),
  );
  final presets = sorbetCssBlocks(
    File('${ui.path}/sorbet-presets.css').readAsStringSync(),
  );
  final tokens = sorbetTokensJson();

  // The JSON is the source of truth; the web CSS must still agree with it.
  group('sorbet-presets.css cross-check', () {
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
            expectSorbetColor(
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
              expectSorbetColor(
                hue.value.ink,
                override,
                '${preset.id}/${hue.key}',
              );
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
          expectSorbetColor(
            entry.value,
            block[entry.key]!,
            'sorbet.css ${entry.key}',
          );
        }
        final hues = SorbetPalettes.hues(SorbetPreset.sorbet, b).byName;
        for (final hue in hues.entries) {
          expectSorbetColor(
            hue.value.ink,
            block[hue.key]!,
            'sorbet.css --${hue.key}',
          );
          final calm = hue.key == 'teal' ? 'cyan' : hue.key;
          expectSorbetColor(
            hue.value.calm,
            block['calendar-bg-$calm']!,
            'sorbet.css --calendar-bg-$calm',
          );
        }
      });
    }
  });

  group('sorbet-tokens.json presets', () {
    final presetJson = tokens['presets'] as Map;
    final palettes = presetJson['palettes'] as Map;
    final roleMap = (presetJson['roles'] as Map).cast<String, String>();

    test('preset ids, source keys and the role mapping', () {
      expect(palettes.keys, SorbetPreset.values.map((p) => p.id));
      final source = SorbetPalettes.source(
        SorbetPreset.matcha,
        Brightness.light,
      );
      expect(presetJson['sources'], source.byCssName.keys);
      expect(roleMap.keys, source.byCssName.keys);
    });

    for (final preset in SorbetPreset.values) {
      for (final b in Brightness.values) {
        test('${preset.id} ${b.name} sources, roles and inks', () {
          final json = (palettes[preset.id] as Map)[b.name] as Map;
          final where = 'presets.palettes.${preset.id}.${b.name}';
          final source = SorbetPalettes.source(preset, b);
          for (final entry in source.byCssName.entries) {
            expectSorbetColor(
              entry.value,
              json[entry.key] as String,
              '$where.${entry.key}',
            );
          }
          // Each source lands on the role `presets.roles` names.
          final base = SorbetPalettes.defaultRoles(b);
          final roles = SorbetRoles.fromSource(
            source,
            b,
            destructive: base.destructive,
            destructiveForeground: base.destructiveForeground,
            fieldStroke: base.fieldStroke,
          ).byJsonName;
          for (final MapEntry(key: from, value: role) in roleMap.entries) {
            expect(
              roles[role],
              source.byCssName[from],
              reason: '$where: $from -> $role',
            );
          }
          // The Sorbet palette restates the default `color` roles.
          if (preset == SorbetPreset.sorbet) {
            final color = (tokens['color'] as Map)[b.name] as Map;
            for (final MapEntry(key: from, value: role) in roleMap.entries) {
              expectSorbetColor(
                source.byCssName[from]!,
                color[role] as String,
                'color.${b.name}.$role',
              );
            }
          }
          final inks = json['inks'] as Map?;
          final hues = SorbetPalettes.hues(preset, b).byName;
          if (preset == SorbetPreset.highContrast) {
            expect(inks?.keys.toSet(), hues.keys.toSet(), reason: where);
          }
          for (final MapEntry(key: hue, value: ink) in (inks ?? {}).entries) {
            expectSorbetColor(
              hues[hue]!.ink,
              ink as String,
              '$where.inks.$hue',
            );
          }
        });
      }
    }
  });

  group('sorbet-tokens.json', () {
    for (final b in Brightness.values) {
      test('default ${b.name} roles and hues', () {
        final color = (tokens['color'] as Map)[b.name] as Map;
        final roles = SorbetPalettes.defaultRoles(b).byJsonName;
        expect(roles.keys.toSet(), color.keys.toSet());
        for (final entry in roles.entries) {
          expectSorbetColor(
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
          expectSorbetColor(
            entry.value.fill,
            json['fill'] as String,
            '$where.fill',
          );
          expectSorbetColor(
            entry.value.calm,
            json['calm'] as String,
            '$where.calm',
          );
          expectSorbetColor(
            entry.value.ink,
            json['ink'] as String,
            '$where.ink',
          );
        }
      });
    }
  });
}
