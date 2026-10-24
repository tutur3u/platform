part of 'settings_compact_navigation_test.dart';

/// The reported case: personal Automatic on a device in `Asia/Saigon`, with
/// the workspace set to the same zone.
const _saigonZones = TimezoneSettingsState(
  workspace: 'Asia/Saigon',
  device: 'Asia/Saigon',
  loading: false,
  resolved: true,
  personalLoaded: true,
  workspaceLoaded: true,
);

void registerSettingsTimezoneRowsChecks() {
  for (final (locale, zone, auto, caption, language, personalTitle) in [
    (
      'en',
      'Ho Chi Minh City',
      'Auto',
      'Time zone',
      'English',
      'Personal timezone',
    ),
    (
      'vi',
      'TP. Hồ Chí Minh',
      'Tự động',
      'Múi giờ',
      'Tiếng Việt',
      'Múi giờ cá nhân',
    ),
  ]) {
    testWidgets('time zone rows keep one friendly value line ($locale)', (
      tester,
    ) async {
      _viewport(tester, const Size(390, 844));
      final h = _SettingsHarness();
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.locale.setLocale(Locale(locale));
      await h.pump(tester);
      h.zones.add(_saigonZones);
      await _settle(tester);
      // Frame the Language row and both Time zone rows for the render.
      await tester.scrollUntilVisible(
        find.text(caption),
        160,
        scrollable: find.byType(Scrollable).first,
      );
      await Scrollable.ensureVisible(
        tester.element(find.text(language)),
        alignment: 0.1,
      );
      await _settle(tester);
      await _capture(tester, 'settings-timezone-rows-$locale');

      // Both rows name the zone once, as a city with its offset; the
      // personal Automatic choice adds only "Auto" on its title line.
      final values = find.text('$zone\u00a0(GMT+7)');
      expect(values, findsNWidgets(2));
      expect(find.text(auto), findsOneWidget);
      expect(find.textContaining('Asia/'), findsNothing);
      expect(find.textContaining('Saigon'), findsNothing);

      // Each value is a single line. In English both rows also match the
      // other title-and-value rows; longer Vietnamese titles may wrap or move
      // "Tự động" under the title, depending on the font.
      final languageValue = find.text(language);
      final lineHeight = tester.getSize(languageValue).height;
      for (final value in [values.at(0), values.at(1)]) {
        expect(tester.getSize(value).height, lineHeight);
      }
      if (locale == 'en') {
        double rowHeight(Finder text) => tester
            .getSize(
              find
                  .ancestor(of: text, matching: find.byType(SettingsTile))
                  .first,
            )
            .height;
        for (final title in [personalTitle, 'Workspace timezone']) {
          expect(rowHeight(find.text(title)), rowHeight(languageValue));
        }
      }
      expect(tester.takeException(), isNull);
    });
  }
}
