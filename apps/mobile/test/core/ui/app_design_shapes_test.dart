import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/ui.dart';

import '../../helpers/pump_app.dart';

/// Pumps [child] through the app theme pipeline and returns its tokens.
Future<AppTokens> _pump(
  WidgetTester tester,
  Widget child, {
  SorbetTheme? sorbet,
  Brightness brightness = Brightness.light,
}) async {
  late AppTokens tokens;
  await tester.pumpWidget(
    sorbetTestApp(
      sorbet: sorbet,
      brightness: brightness,
      home: Builder(
        builder: (context) {
          tokens = AppTokens.of(context);
          return Material(
            child: Center(child: SizedBox(width: 320, child: child)),
          );
        },
      ),
    ),
  );
  await tester.pumpAndSettle();
  return tokens;
}

ShapeBorder _materialShape(WidgetTester tester, Finder within) => tester
    .widget<Material>(
      find.descendant(of: within, matching: find.byType(Material)).first,
    )
    .shape!;

double _radius(ShapeBorder shape) =>
    ((shape as RoundedRectangleBorder).borderRadius as BorderRadius).topLeft.x;

BoxDecoration _decoration(WidgetTester tester, Finder within) =>
    tester
            .widget<DecoratedBox>(
              find
                  .descendant(of: within, matching: find.byType(DecoratedBox))
                  .first,
            )
            .decoration
        as BoxDecoration;

OutlineInputBorder _fieldBorder(WidgetTester tester) =>
    tester.widget<TextField>(find.byType(TextField)).decoration!.enabledBorder!
        as OutlineInputBorder;

void main() {
  group('AppShapes', () {
    test('classic keeps the component values', () {
      final shapes = AppShapes.classic(
        AppInterfaceTokens.standard,
        AppColorTokens.light,
      );
      expect(shapes.button, 10);
      expect(shapes.field, 12);
      expect(shapes.textArea, 12);
      expect(shapes.chip, 10);
      expect(shapes.badge, AppRadius.pill);
      expect(shapes.segment, AppRadius.pill);
      expect(shapes.card, AppRadius.md);
      expect(shapes.panel, AppRadius.card);
      expect(shapes.sheet, AppRadius.sheet);
      expect(shapes.dialog, AppRadius.sheet);
      expect(shapes.handleSize, const Size(40, 5));
      expect(shapes.fieldMinHeight, 0);
    });

    test('classic follows the Appearance corner style', () {
      const soft = AppInterfaceTokens(corners: AppCornerStyle.soft);
      final shapes = AppShapes.classic(soft, AppColorTokens.light);
      expect(shapes.button, soft.radius(10));
      expect(shapes.card, soft.radius(AppRadius.md));
      expect(shapes.sheet, soft.radius(AppRadius.sheet));
      expect(shapes.chip, 10);
      expect(shapes.dialog, AppRadius.sheet);
    });

    for (final (option, control, card, panel, sheet) in [
      (SorbetRadius.soft, 9999.0, 18.0, 24.0, 24.0),
      (SorbetRadius.sharp, 8.0, 10.0, 12.0, 12.0),
      (SorbetRadius.round, 9999.0, 24.0, 32.0, 28.0),
    ]) {
      test('Sorbet ${option.name} corners', () {
        final tokens = SorbetTokens.resolve(
          SorbetTheme(radius: option),
          Brightness.light,
          ring: const Color(0xFF000000),
        );
        final shapes = AppShapes.sorbet(tokens, AppColorTokens.light);
        for (final value in [
          shapes.button,
          shapes.field,
          shapes.chip,
          shapes.badge,
          shapes.segment,
        ]) {
          expect(value, control);
        }
        expect(shapes.card, card);
        expect(shapes.panel, panel);
        expect(shapes.sheet, sheet);
        expect(shapes.dialog, sheet);
        expect(shapes.textArea, tokens.radii.control);
        expect(shapes.handleSize, const Size(36, 4));
        expect(shapes.fieldMinHeight, 44);
      });
    }

    test('inset keeps corners concentric and pills round', () {
      expect(AppShapes.inset(8, 4), 4);
      expect(AppShapes.inset(2, 4), 0);
      expect(AppShapes.inset(AppRadius.pill, 4), AppRadius.pill);
      expect(AppShapes.inset(9999, 4), 9999);
    });
  });

  group('controls resolve shape from tokens', () {
    for (final sorbet in [null, const SorbetTheme()]) {
      final design = sorbet == null ? 'classic' : 'Sorbet';

      testWidgets('$design buttons and icon buttons', (tester) async {
        final tokens = await _pump(
          tester,
          Column(
            children: [
              AppButton.primary(
                key: const Key('button'),
                onPressed: () {},
                child: const Text('Save'),
              ),
              AppIconButton(
                key: const Key('icon'),
                tooltip: 'Add',
                icon: const Icon(Icons.add),
                onPressed: () {},
              ),
            ],
          ),
          sorbet: sorbet,
        );
        final expected = sorbet == null ? 10.0 : 9999.0;
        for (final key in ['button', 'icon']) {
          expect(
            _radius(_materialShape(tester, find.byKey(Key(key)))),
            expected,
          );
        }
        final label = DefaultTextStyle.of(tester.element(find.text('Save')));
        expect(label.style.fontSize, tokens.typography.ui.fontSize);
        expect(label.style.fontWeight, tokens.typography.ui.fontWeight);
      });

      testWidgets('$design text fields', (tester) async {
        await _pump(
          tester,
          const AppTextField(placeholder: 'Name'),
          sorbet: sorbet,
        );
        final single = _fieldBorder(tester).borderRadius.topLeft.x;
        final field = tester.widget<TextField>(find.byType(TextField));
        expect(field.style?.fontSize, 16);
        if (sorbet == null) {
          expect(single, 12);
          expect(field.decoration!.constraints, isNull);
        } else {
          expect(single, 9999);
          expect(field.decoration!.constraints?.minHeight, 44);
          expect(
            tester.getSize(find.byType(TextField)).height,
            greaterThanOrEqualTo(44),
          );
        }

        await _pump(
          tester,
          const AppTextField(placeholder: 'Notes', maxLines: 4),
          sorbet: sorbet,
        );
        // Multi-line fields keep 12 corners in both designs: classic
        // `field` and the Sorbet soft `md` radius.
        expect(_fieldBorder(tester).borderRadius.topLeft.x, 12);
      });

      testWidgets('$design search field and select', (tester) async {
        await _pump(
          tester,
          Column(
            children: [
              AppSearchField(controller: TextEditingController()),
              AppSelect<int>(
                key: const Key('select'),
                title: 'Size',
                value: 1,
                onChanged: (_) {},
                options: const [AppSelectOption(value: 1, label: 'One')],
              ),
            ],
          ),
          sorbet: sorbet,
        );
        final expected = sorbet == null ? 12.0 : 9999.0;
        expect(_fieldBorder(tester).borderRadius.topLeft.x, expected);
        expect(
          _radius(_materialShape(tester, find.byKey(const Key('select')))),
          expected,
        );
      });

      testWidgets('$design chips, badges and segments', (tester) async {
        await _pump(
          tester,
          Column(
            children: [
              AppChip(
                key: const Key('chip'),
                label: const Text('Today'),
                selected: true,
                onSelected: (_) {},
              ),
              const AppBadge(key: Key('badge'), child: Text('New')),
              AppSegmentedControl<int>(
                key: const Key('segments'),
                segments: const [
                  AppSegment(value: 0, label: 'Day'),
                  AppSegment(value: 1, label: 'Week'),
                ],
                selected: 0,
                onChanged: (_) {},
              ),
            ],
          ),
          sorbet: sorbet,
        );
        double radiusOf(String key) =>
            (_decoration(tester, find.byKey(Key(key))).borderRadius!
                    as BorderRadius)
                .topLeft
                .x;
        final chipFace =
            tester
                    .widget<Container>(
                      find
                          .descendant(
                            of: find.byKey(const Key('chip')),
                            matching: find.byType(Container),
                          )
                          .first,
                    )
                    .decoration!
                as BoxDecoration;
        expect(
          (chipFace.borderRadius! as BorderRadius).topLeft.x,
          sorbet == null ? 10 : 9999,
        );
        // The focus ring keeps 8 in classic and follows the pill in Sorbet.
        expect(radiusOf('chip'), sorbet == null ? 8 : 9999);
        expect(radiusOf('badge'), sorbet == null ? AppRadius.pill : 9999);
        expect(radiusOf('segments'), sorbet == null ? AppRadius.pill : 9999);
      });

      testWidgets('$design cards and panels', (tester) async {
        final tokens = await _pump(
          tester,
          const Column(
            children: [
              AppCard(key: Key('card'), child: Text('Card')),
              AppPanel(key: Key('panel'), title: 'Panel', child: Text('Body')),
            ],
          ),
          sorbet: sorbet,
        );
        final card = _decoration(tester, find.byKey(const Key('card')));
        final panel = _decoration(tester, find.byKey(const Key('panel')));
        double radius(BoxDecoration d) =>
            (d.borderRadius! as BorderRadius).topLeft.x;
        if (sorbet == null) {
          expect(radius(card), AppRadius.md);
          expect(radius(panel), AppRadius.card);
          expect(card.border, isNotNull);
          expect(panel.border, isNotNull);
          expect(card.boxShadow, isEmpty);
        } else {
          expect(radius(card), 18);
          expect(radius(panel), 24);
          expect(card.border, isNull);
          expect(panel.border, isNull);
          expect(card.boxShadow, tokens.depth.card);
          expect(panel.color?.a, 1);
        }
      });
    }

    testWidgets('Sorbet cards keep an outline under high contrast', (
      tester,
    ) async {
      await tester.pumpWidget(
        sorbetTestApp(
          sorbet: const SorbetTheme(),
          home: Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(context).copyWith(highContrast: true),
              child: const Material(
                child: AppCard(key: Key('card'), child: Text('Card')),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        _decoration(tester, find.byKey(const Key('card'))).border,
        isNotNull,
      );
    });

    for (final sorbet in [null, const SorbetTheme()]) {
      final design = sorbet == null ? 'classic' : 'Sorbet';
      testWidgets('$design sheets: handle, corners and safe area', (
        tester,
      ) async {
        tester.view
          ..physicalSize = const Size(390, 844)
          ..devicePixelRatio = 1
          ..padding = const FakeViewPadding(bottom: 34);
        addTearDown(tester.view.reset);
        late AppTokens tokens;
        await tester.pumpWidget(
          sorbetTestApp(
            sorbet: sorbet,
            home: Builder(
              builder: (context) {
                tokens = AppTokens.of(context);
                return const Align(
                  alignment: Alignment.bottomCenter,
                  child: AppSheetSurface(
                    showHandle: true,
                    child: AppSheetScaffold(
                      title: 'Filters',
                      child: Text('Last row'),
                    ),
                  ),
                );
              },
            ),
          ),
        );
        await tester.pumpAndSettle();
        final handle = find.byKey(const ValueKey('app-sheet-handle'));
        expect(
          tester.getSize(handle),
          sorbet == null ? const Size(40, 5) : const Size(36, 4),
        );
        final handleBox =
            tester.widget<Container>(handle).decoration! as BoxDecoration;
        expect(handleBox.color, tokens.shapes.handleColor);
        if (sorbet != null) {
          expect(handleBox.color, tokens.colorScheme.input);
        }
        final surface = tester.widget<Material>(
          find
              .descendant(
                of: find.byType(AppSheetSurface),
                matching: find.byType(Material),
              )
              .first,
        );
        expect(
          (surface.borderRadius! as BorderRadius).topLeft.x,
          sorbet == null ? AppRadius.sheet : 24,
        );
        expect(
          tester.getTopLeft(handle).dy -
              tester.getTopLeft(find.byType(AppSheetSurface)).dy,
          AppSpacing.sm,
        );
        expect(
          tester.getBottomLeft(find.text('Last row')).dy,
          lessThanOrEqualTo(844 - 34),
        );
      });
    }

    testWidgets('sharp corners shrink every control', (tester) async {
      await _pump(
        tester,
        AppButton.primary(
          key: const Key('button'),
          onPressed: () {},
          child: const Text('Save'),
        ),
        sorbet: const SorbetTheme(radius: SorbetRadius.sharp),
      );
      expect(
        _radius(_materialShape(tester, find.byKey(const Key('button')))),
        8,
      );
    });
  });
}
