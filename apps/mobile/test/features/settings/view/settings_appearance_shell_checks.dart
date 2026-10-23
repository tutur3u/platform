part of 'settings_compact_navigation_test.dart';

final Finder _appearanceScrollable = find
    .descendant(
      of: find.byKey(const ValueKey('appearance-page')),
      matching: find.byType(Scrollable),
    )
    .first;

Iterable<AmbientBackground> _ambientLayers(WidgetTester tester) =>
    tester.widgetList<AmbientBackground>(find.byType(AmbientBackground));

Future<_SettingsHarness> _pumpAppearance(
  WidgetTester tester,
  AppearanceSettings appearance, {
  shad.ThemeMode mode = shad.ThemeMode.light,
  Size size = const Size(390, 844),
  double scale = 1,
  String locale = 'en',
}) async {
  _viewport(tester, size);
  final h = _SettingsHarness();
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await h.dispose();
  });
  await h.locale.setLocale(Locale(locale));
  await h.theme.setThemeMode(mode);
  if (!appearance.isDefault) await h.theme.setAppearance(appearance);
  await h.pump(tester, scale: scale);
  return h;
}

void registerSettingsAppearanceShellChecks() {
  for (final sample in [
    ('classic-light', const AppearanceSettings(), shad.ThemeMode.light),
    ('classic-dark', const AppearanceSettings(), shad.ThemeMode.dark),
    (
      'aurora-blobs-dark',
      const AppearanceSettings(
        theme: AppearanceThemeId.aurora,
        backgroundStyle: AppearanceBackgroundStyle.blobs,
      ),
      shad.ThemeMode.dark,
    ),
    (
      'sunset-gradient-light',
      const AppearanceSettings(
        theme: AppearanceThemeId.sunset,
        backgroundStyle: AppearanceBackgroundStyle.gradient,
      ),
      shad.ThemeMode.light,
    ),
  ]) {
    testWidgets('${sample.$1} appearance applies through the shell', (
      tester,
    ) async {
      final appearance = sample.$2;
      final h = await _pumpAppearance(tester, appearance, mode: sample.$3);
      final ambient = appearance.hasAmbientBackground;
      // One app-level layer behind every route; none for solid themes.
      expect(_ambientLayers(tester), hasLength(ambient ? 1 : 0));
      final scaffolds = tester.widget<shad.ComponentTheme<shad.ScaffoldTheme>>(
        find.byKey(const ValueKey('appearance-routes')),
      );
      expect(scaffolds.data.backgroundColor?.a, ambient ? 0 : isNull);
      final group = tester.widget<DecoratedBox>(
        find
            .descendant(
              of: find.byType(SettingsGroup).first,
              matching: find.byType(DecoratedBox),
            )
            .first,
      );
      final fill = (group.decoration as BoxDecoration).color!;
      expect(fill.a, closeTo(ambient ? appearance.surfaceOpacity : 1, 0.01));
      final row = tester.widget<SettingsTile>(
        find.byKey(const ValueKey('settings-appearance-row')),
      );
      expect(row.trailingValue, isNotEmpty);
      expect(find.byKey(const ValueKey('settings-profile-header')), findsOne);
      expect(find.byType(AppBar), findsNothing);
      await _capture(tester, 'settings-${sample.$1}');

      await _tapRow(tester, const ValueKey('settings-appearance-row'));
      expect(h.router.state.matchedLocation, Routes.settingsAppearance);
      expect(find.byType(MorphingNavigationBar), findsOneWidget);
      // Gallery swatches add static previews; the page layer stays single.
      expect(
        _ambientLayers(tester).where((layer) => layer.motion != null),
        isEmpty,
      );
      await _capture(tester, 'appearance-${sample.$1}');
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('appearance choices apply instantly, persist and reset', (
    tester,
  ) async {
    final h = await _pumpAppearance(tester, const AppearanceSettings());
    await _tapRow(tester, const ValueKey('settings-appearance-row'));
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.get('appearance-v1'), isNull);

    await _tapRow(tester, const ValueKey('appearance-theme-aurora'));
    expect(h.theme.state.appearance.theme, AppearanceThemeId.aurora);
    expect(
      h.theme.state.appearance.backgroundStyle,
      AppearanceBackgroundStyle.blobs,
    );
    expect(
      AppearanceSettings.decode(prefs.getString('appearance-v1')),
      h.theme.state.appearance,
    );

    await _tapRow(tester, const ValueKey('appearance-accent-violet'));
    expect(h.theme.state.appearance.accent, AppearanceAccentId.violet);

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('appearance-intensity')),
      160,
      scrollable: _appearanceScrollable,
    );
    await _settle(tester);
    final slider = find.descendant(
      of: find.byKey(const ValueKey('appearance-intensity')),
      matching: find.byType(Slider),
    );
    final before = h.theme.state.appearance.intensity;
    await tester.drag(slider, const Offset(-120, 0));
    await _settle(tester);
    final after = h.theme.state.appearance.intensity;
    expect(after, lessThan(before));
    expect(
      AppearanceSettings.decode(prefs.getString('appearance-v1')).intensity,
      after,
    );

    Finder segment(String group, String label) => find.descendant(
      of: find.byKey(ValueKey(group)),
      matching: find.text(label),
    );
    await tester.scrollUntilVisible(
      segment('appearance-background', 'Gradient'),
      -160,
      scrollable: _appearanceScrollable,
    );
    await _settle(tester);
    await tester.tap(segment('appearance-background', 'Gradient'));
    await _settle(tester);
    expect(
      h.theme.state.appearance.backgroundStyle,
      AppearanceBackgroundStyle.gradient,
    );
    expect(find.byKey(const ValueKey('appearance-softness')), findsNothing);

    await tester.scrollUntilVisible(
      segment('appearance-mode', 'Dark'),
      -160,
      scrollable: _appearanceScrollable,
    );
    await _settle(tester);
    await tester.tap(segment('appearance-mode', 'Dark'));
    await _settle(tester);
    expect(h.theme.state.themeMode, shad.ThemeMode.dark);
    expect(prefs.getString('theme-mode'), 'dark');

    final reset = find.byKey(const ValueKey('appearance-reset'));
    await tester.scrollUntilVisible(
      reset,
      200,
      scrollable: _appearanceScrollable,
    );
    await _settle(tester);
    await tester.tap(reset);
    await _settle(tester);
    expect(h.theme.state.appearance, const AppearanceSettings());
    expect(h.theme.state.themeMode, shad.ThemeMode.system);
    expect(find.text('Appearance reset to default'), findsOneWidget);
    // Let the confirmation toast expire so no timer outlives the test.
    await tester.pump(const Duration(seconds: 10));
    await _settle(tester);

    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(h.router.state.matchedLocation, Routes.settings);
    expect(tester.takeException(), isNull);
  });

  for (final reduced in [false, true]) {
    testWidgets('animated blobs ${reduced ? 'stay still' : 'drift'} '
        '${reduced ? 'with' : 'without'} reduced motion', (tester) async {
      if (reduced) {
        tester.platformDispatcher.accessibilityFeaturesTestValue =
            const FakeAccessibilityFeatures(disableAnimations: true);
        addTearDown(
          tester.platformDispatcher.clearAccessibilityFeaturesTestValue,
        );
      }
      await _pumpAppearance(
        tester,
        const AppearanceSettings(
          theme: AppearanceThemeId.forest,
          backgroundStyle: AppearanceBackgroundStyle.blobs,
          animate: true,
        ),
        mode: shad.ThemeMode.dark,
      );
      final layer = _ambientLayers(tester).single;
      expect(layer.motion, reduced ? isNull : isNotNull);
      final scope = tester.widget<AppearanceScope>(
        find.byType(AppearanceScope),
      );
      expect(scope.motion, reduced ? isNull : isNotNull);
      if (!reduced) {
        final start = layer.motion!.value;
        await tester.pump(const Duration(milliseconds: 500));
        expect(layer.motion!.value, isNot(start));
      }
      await _tapRow(tester, const ValueKey('settings-appearance-row'));
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('appearance-animate')),
        160,
        scrollable: _appearanceScrollable,
      );
      await _settle(tester);
      expect(
        find.text('Reduce Motion is on, so the background stays still.'),
        reduced ? findsOneWidget : findsNothing,
      );
      await _capture(tester, 'appearance-forest-blobs-reduced-$reduced');
      expect(tester.takeException(), isNull);
    });
  }

  for (final locale in ['en', 'vi']) {
    testWidgets('appearance page fits 320px at 2x text in $locale', (
      tester,
    ) async {
      final h = await _pumpAppearance(
        tester,
        const AppearanceSettings(
          theme: AppearanceThemeId.ember,
          backgroundStyle: AppearanceBackgroundStyle.blobs,
        ),
        size: const Size(320, 568),
        scale: 2,
        locale: locale,
      );
      expect(tester.takeException(), isNull);
      await _tapRow(tester, const ValueKey('settings-appearance-row'));
      expect(h.router.state.matchedLocation, Routes.settingsAppearance);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('appearance-reset')),
        200,
        scrollable: _appearanceScrollable,
      );
      final position = tester
          .state<ScrollableState>(_appearanceScrollable)
          .position;
      position.jumpTo(position.maxScrollExtent);
      await _settle(tester);
      final reset = tester.getRect(
        find.byKey(const ValueKey('appearance-reset')),
      );
      expect(
        reset.bottom,
        lessThan(tester.getRect(find.byType(MorphingNavigationBar)).top),
      );
      await _capture(tester, 'appearance-ember-$locale-large-text');
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('New chip features Aurora once, then retires', (tester) async {
    final h = await _pumpAppearance(tester, const AppearanceSettings());
    SettingsTile row() => tester.widget<SettingsTile>(
      find.byKey(const ValueKey('settings-appearance-row')),
    );
    expect(row().badge, 'New');
    await _tapRow(tester, const ValueKey('settings-appearance-row'));
    expect(h.router.state.matchedLocation, Routes.settingsAppearance);
    expect(h.router.state.uri.queryParameters['highlight'], 'aurora');
    expect(find.bySemanticsLabel('Aurora, New'), findsOneWidget);
    expect(
      (await SharedPreferences.getInstance()).getBool('appearance-intro-seen'),
      isTrue,
    );
    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(row().badge, isNull);
    await _tapRow(tester, const ValueKey('settings-appearance-row'));
    expect(h.router.state.uri.queryParameters, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('workspace stat stays on one line beside the name', (
    tester,
  ) async {
    await _pumpAppearance(tester, const AppearanceSettings());
    final stat = find.byKey(const ValueKey('settings-profile-workspaces'));
    final header = find.byKey(const ValueKey('settings-profile-header'));
    expect(stat, findsOneWidget);
    // Beside the identity, not wrapped under it.
    expect(
      tester.getRect(stat).left,
      greaterThan(tester.getRect(header).right),
    );
    final label = find.descendant(of: stat, matching: find.text('workspace'));
    final line = tester.getSize(label).height;
    expect(line, lessThan(tester.getSize(find.text('1')).height));
    expect(tester.takeException(), isNull);
  });
}
