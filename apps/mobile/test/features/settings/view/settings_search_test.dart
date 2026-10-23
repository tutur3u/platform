import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/settings/view/settings_search.dart';

SettingsSearchEntry _entry(String id, String title, {List<String>? terms}) =>
    SettingsSearchEntry(
      id: id,
      icon: Icons.tune_rounded,
      title: title,
      section: 'Apps · Timer',
      terms: terms ?? const [],
      onOpen: () {},
    );

void main() {
  test('folding strips Vietnamese diacritics and case', () {
    expect(foldSettingsSearch(' Múi giờ CÁ NHÂN '), 'mui gio ca nhan');
    expect(foldSettingsSearch('Đổi ảnh đại diện'), 'doi anh dai dien');
  });

  test('every query word must match the title, section or terms', () {
    final entries = [
      _entry('pomodoro', 'Pomodoro settings'),
      _entry('threshold', 'Request threshold', terms: ['approval']),
      _entry('zone', 'Múi giờ cá nhân'),
    ];
    List<String> ids(String query) => [
      for (final entry in filterSettingsSearch(entries, query)) entry.id,
    ];
    expect(ids('pomo'), ['pomodoro']);
    expect(ids('timer approval'), ['threshold']);
    expect(ids('mui gio'), ['zone']);
    expect(ids('apps'), ['pomodoro', 'threshold', 'zone']);
    expect(ids('missing'), isEmpty);
    expect(ids('   '), isEmpty);
  });
}
