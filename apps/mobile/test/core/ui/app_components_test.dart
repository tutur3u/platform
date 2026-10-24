import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/ui/ui.dart';

Widget _host(Widget child, {ThemeData? theme, double scale = 1}) => MaterialApp(
  theme: theme ?? AppTheme.light,
  home: MediaQuery(
    data: MediaQueryData(
      size: const Size(390, 844),
      textScaler: TextScaler.linear(scale),
    ),
    child: Scaffold(body: SingleChildScrollView(child: child)),
  ),
);

void main() {
  group('AppTokens', () {
    testWidgets('reads the appearance extension, else Classic', (tester) async {
      late AppTokens tokens;
      final probe = Builder(
        builder: (context) {
          tokens = AppTokens.of(context);
          return const SizedBox();
        },
      );
      await tester.pumpWidget(_host(probe, theme: AppTheme.dark));
      await tester.pumpAndSettle();
      expect(tokens.colorScheme, AppColorTokens.dark);
      expect(tokens.isDark, isTrue);

      const settings = AppearanceSettings(theme: AppearanceThemeId.ocean);
      final ocean = AppearanceTheme.materialTheme(settings, Brightness.light);
      await tester.pumpWidget(_host(probe, theme: ocean));
      await tester.pumpAndSettle();
      final scheme = AppearanceTheme.colorScheme(settings, Brightness.light);
      expect(tokens.colorScheme.primary, scheme.primary);
      expect(tokens.colorScheme.background, scheme.background);

      await tester.pumpWidget(_host(probe, theme: ThemeData()));
      await tester.pumpAndSettle();
      expect(tokens.colorScheme, AppColorTokens.light);
    });

    test('typography keeps the legacy metrics', () {
      const type = AppTypography();
      expect(type.small.fontSize, 14);
      expect(type.textSmall.fontWeight, FontWeight.w500);
      expect(type.h4.fontSize, 18);
      expect(type.xSmall.fontFamily, 'NotoSans');
    });
  });

  group('AppGap', () {
    testWidgets('follows the parent axis', (tester) async {
      await tester.pumpWidget(
        _host(
          const Column(
            children: [
              Row(
                children: [
                  Text('a'),
                  AppGap(12, key: Key('row')),
                  Text('b'),
                ],
              ),
              AppGap(20, key: Key('column')),
            ],
          ),
        ),
      );
      expect(tester.getSize(find.byKey(const Key('row'))).width, 12);
      expect(tester.getSize(find.byKey(const Key('row'))).height, 0);
      expect(tester.getSize(find.byKey(const Key('column'))).height, 20);
      expect(tester.getSize(find.byKey(const Key('column'))).width, 0);
    });
  });

  for (final (name, theme) in [
    ('light', AppTheme.light),
    ('dark', AppTheme.dark),
  ]) {
    testWidgets('components render in $name with large text', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var pressed = 0;
      var switched = false;
      await tester.pumpWidget(
        _host(
          theme: theme,
          scale: 2,
          Column(
            children: [
              AppButton.primary(
                onPressed: () => pressed++,
                child: const Text('Save'),
              ),
              AppButton.secondary(onPressed: () {}, child: const Text('Two')),
              AppButton.outline(onPressed: () {}, child: const Text('Three')),
              AppButton.ghost(onPressed: () {}, child: const Text('Four')),
              const AppButton.destructive(onPressed: null, child: Text('Del')),
              const AppButton.primary(
                onPressed: null,
                loading: true,
                child: Text('Busy'),
              ),
              AppIconButton(
                tooltip: 'Close',
                icon: const Icon(AppIcons.close),
                onPressed: () {},
              ),
              const AppTextField(placeholder: 'Name', label: 'Name'),
              AppSearchField(controller: TextEditingController()),
              const AppCard(child: Text('Card')),
              const AppBadge(child: Text('New')),
              const AppBadge.outline(child: Text('Draft')),
              const AppAlert(title: Text('Heads up'), content: Text('Body')),
              const AppAlert.destructive(title: Text('Failed')),
              const AppDivider(),
              StatefulBuilder(
                builder: (context, setState) => AppSwitch(
                  value: switched,
                  semanticLabel: 'Haptics',
                  onChanged: (value) => setState(() => switched = value),
                ),
              ),
              AppCheckbox(value: true, onChanged: (_) {}),
            ],
          ),
        ),
      );
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Save'));
      expect(pressed, 1);
      expect(find.bySemanticsLabel('Close'), findsOneWidget);
      await tester.ensureVisible(find.byType(AppSwitch));
      await tester.tap(find.byType(AppSwitch));
      await tester.pump();
      expect(switched, isTrue);
    });
  }

  testWidgets('toast stays above the dock clearance and replaces the last', (
    tester,
  ) async {
    late BuildContext host;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(390, 844),
            padding: EdgeInsets.only(bottom: 96),
          ),
          child: Builder(
            builder: (context) {
              host = context;
              return const SizedBox.expand();
            },
          ),
        ),
      ),
    );
    showAppToast(host, message: 'First');
    final second = showAppToast(host, message: 'Saved');
    await tester.pump();
    expect(find.text('First'), findsNothing);
    expect(find.text('Saved'), findsOneWidget);
    expect(tester.getRect(find.byType(AppAlert)).bottom, lessThan(844 - 96));
    second.close();
    await tester.pump();
    expect(find.text('Saved'), findsNothing);
  });

  testWidgets('buttons keep their visuals but expose 48dp tap targets', (
    tester,
  ) async {
    var taps = 0;
    await tester.pumpWidget(
      _host(
        Column(
          children: [
            AppIconButton(
              key: const Key('dense'),
              tooltip: 'Dense',
              density: AppButtonDensity.iconDense,
              size: AppButtonSize.small,
              icon: const Icon(AppIcons.close),
              onPressed: () => taps++,
            ),
            AppIconButton(
              key: const Key('icon'),
              tooltip: 'Icon',
              icon: const Icon(AppIcons.close),
              onPressed: () => taps++,
            ),
            AppButton.primary(
              key: const Key('small'),
              size: AppButtonSize.small,
              onPressed: () => taps++,
              child: const Text('Go'),
            ),
          ],
        ),
      ),
    );
    for (final (key, visual) in [
      ('dense', 24.0),
      ('icon', 40.0),
      ('small', 32.0),
    ]) {
      final target = find.byKey(Key(key));
      final rect = tester.getRect(target);
      expect(rect.height, greaterThanOrEqualTo(kAppMinTapTarget), reason: key);
      expect(rect.width, greaterThanOrEqualTo(kAppMinTapTarget), reason: key);
      // The painted surface keeps its visual height.
      final surface = find.descendant(
        of: target,
        matching: find.byType(Material),
      );
      expect(tester.getSize(surface.first).height, visual, reason: key);
      // A tap in the padded margin, outside the surface, still activates.
      final before = taps;
      await tester.tapAt(rect.topLeft + const Offset(2, 2));
      await tester.pump(const Duration(milliseconds: 400));
      expect(taps, before + 1, reason: key);
    }
  });
}
