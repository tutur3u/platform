import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palettes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/tokens/app_typography.dart';

import 'sorbet_parity_support.dart';

/// Radius, space, motion, controls, mobile metrics, roles, type and shadows
/// against `sorbet-tokens.json`.
void main() {
  final tokens = sorbetTokensJson();

  group('sorbet-tokens.json scales', () {
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

    test('corner options match radius.corners', () {
      final corners = (tokens['radius'] as Map)['corners'] as Map;
      expect(corners.keys, SorbetRadius.values.map((r) => r.name));
      for (final option in SorbetRadius.values) {
        final r = SorbetRadii.of(option);
        final json = corners[option.name] as Map;
        expect(
          {
            'sm': r.small,
            'md': r.control,
            'lg': r.card,
            'xl': r.panel,
            'control': r.interactive,
            'sheet': r.sheet,
            'popover': r.popover,
          },
          json.map((k, v) => MapEntry(k, (v as num).toDouble())),
          reason: 'radius.corners.${option.name}',
        );
      }
      expect(
        SorbetRadii.of(SorbetRadius.soft).sheet,
        (tokens['mobile'] as Map)['sheetRadius'],
      );
    });

    test('roles, focus, skeleton motion and dock metrics', () {
      for (final b in Brightness.values) {
        final roles = SorbetPalettes.defaultRoles(b).byJsonName;
        final resolved = SorbetTokens.resolve(
          const SorbetTheme(),
          b,
          ring: const Color(0xFF000000),
        );
        final json = (tokens['roles'] as Map).cast<String, String>();
        expect(resolved.navSelectedFill, roles[json['navSelectedFill']]);
        expect(resolved.navSelectedInk, roles[json['navSelectedInk']]);
        expect(resolved.dockSurface, roles[json['dockSurface']]);
        expect(resolved.skeleton, roles[json['skeleton']]);
        // Surface roles: pages, sheets and outline strokes.
        final theme = SorbetAppTheme.materialTheme(const SorbetTheme(), b);
        final colors = SorbetAppTheme.colorTokens(const SorbetTheme(), b);
        expect(theme.scaffoldBackgroundColor, roles[json['pageSurface']]);
        expect(colors.popover, roles[json['sheetSurface']]);
        expect(colors.input, roles[json['outlineStroke']]);
        expect(json['frameSurface'], 'ground');
        expect(resolved.eventTone.name, json['eventFill']);
        expect(resolved.tagTone.name, json['tagFill']);
        final blue = resolved.hues.blue;
        expect(resolved.eventFill(blue), blue.calm);
        expect(resolved.tagFill(blue), blue.fill);
      }

      final focus = tokens['focus'] as Map;
      const ring = SorbetFocusRing();
      expect(
        [ring.width, ring.offset, ring.highContrastWidth],
        [focus['width'], focus['offset'], focus['highContrastWidth']],
      );

      final skeleton = (tokens['motion'] as Map)['skeleton'] as Map;
      expect(
        const SorbetMotion().skeletonPulse.inMilliseconds,
        skeleton['pulse'],
      );
      expect(skeleton['reducedMotion'], 'static');

      final mobile = tokens['mobile'] as Map;
      const metrics = SorbetMetrics();
      expect(
        {
          'breakpoint': metrics.breakpoint,
          'tabletBreakpoint': metrics.tabletBreakpoint,
          'tabletGutter': metrics.tabletGutter,
          'dockMaxWidth': metrics.dockMaxWidth,
          'dockHairlineOpacity': metrics.dockHairlineOpacity,
          'dockFadeHeight': metrics.dockFadeHeight,
          'dockBlur': metrics.dockBlur,
        },
        {
          for (final key in [
            'breakpoint',
            'tabletBreakpoint',
            'tabletGutter',
            'dockMaxWidth',
            'dockHairlineOpacity',
            'dockFadeHeight',
            'dockBlur',
          ])
            key: (mobile[key] as num).toDouble(),
        },
      );
    });

    test('type styles match the contract', () {
      final styles = (tokens['type'] as Map)['styles'] as Map;
      final families = (tokens['type'] as Map)['families'] as Map;
      final type = SorbetTokens.resolve(
        const SorbetTheme(),
        Brightness.light,
        ring: const Color(0xFF000000),
      ).typography;
      expect((families['sans'] as List).first, 'Nunito');
      expect((families['mono'] as List).first, 'JetBrains Mono');
      for (final (key, role) in [
        ('display-lg', AppTypeScale.sorbet.display),
        ('title', AppTypeScale.sorbet.title),
        ('heading', AppTypeScale.sorbet.heading),
        ('body-lg', AppTypeScale.sorbet.bodyLg),
        ('body', AppTypeScale.sorbet.body),
        ('body-sm', AppTypeScale.sorbet.bodySm),
        ('ui', AppTypeScale.sorbet.ui),
        ('ui-sm', AppTypeScale.sorbet.uiSm),
        ('small', AppTypeScale.sorbet.caption),
        ('label', AppTypeScale.sorbet.overline),
        ('numeric', AppTypeScale.sorbet.numeric),
      ]) {
        final json = styles[key] as Map;
        expect(role.size, json['mobileSize'] ?? json['size'], reason: key);
        expect(role.weight.value, json['weight'], reason: key);
        expect(role.tracking, json['tracking'], reason: key);
        expect(role.mono, json['family'] == 'mono', reason: key);
        expect(role.tabular, json['tabular'] ?? false, reason: key);
      }
      expect(type.overline.fontFamily, SorbetFonts.mono);
    });

    test('shadows match the contract', () {
      final shadow = tokens['shadow'] as Map;
      final part = RegExp(
        r'(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?'
        r'(?:\s+(-?[\d.]+)(?:px)?)?\s+(rgba\([^)]*\))',
      );
      for (final (mode, recipes) in [
        ('light', SorbetShadows.light),
        ('dark', SorbetShadows.dark),
      ]) {
        final json = shadow[mode] as Map;
        for (final (size, list) in [
          ('sm', recipes.sm),
          ('md', recipes.md),
          ('lg', recipes.lg),
        ]) {
          final where = 'shadow.$mode.$size';
          final parts = part.allMatches(json[size] as String).toList();
          expect(list, hasLength(parts.length), reason: where);
          for (var i = 0; i < parts.length; i++) {
            final m = parts[i];
            final actual = list[i];
            expect(actual.offset.dx, double.parse(m[1]!), reason: where);
            expect(actual.offset.dy, double.parse(m[2]!), reason: where);
            expect(actual.blurRadius, double.parse(m[3]!), reason: where);
            expect(
              actual.spreadRadius,
              double.parse(m[4] ?? '0'),
              reason: where,
            );
            expectSorbetColor(actual.color, m[5]!, where);
          }
        }
      }
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
