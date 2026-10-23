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

  test('decomposed input with combining marks folds like precomposed', () {
    // "múi giò" typed as base letters plus U+0301 and U+0300.
    const decomposed = 'mu\u0301i gio\u0300';
    expect(foldSettingsSearch(decomposed), 'mui gio');
    // "ờ" as o + horn (U+031B) + grave (U+0300).
    expect(foldSettingsSearch('gio\u031B\u0300'), 'gio');
    final entries = [_entry('zone', 'Múi giờ cá nhân')];
    expect(filterSettingsSearch(entries, decomposed).single.id, 'zone');
    expect(filterSettingsSearch(entries, 'múi giò').single.id, 'zone');
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
