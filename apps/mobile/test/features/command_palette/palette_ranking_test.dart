import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/command_palette/palette_catalog.dart';
import 'package:mobile/features/command_palette/palette_entry.dart';

void main() {
  test('ranks prefix, word-start, and subsequence with stable ties', () {
    const labels = [
      'Make October easier',
      'Unrelated',
      'Open more',
      'More settings',
      'More actions',
      'Show more',
    ];
    expect(
      rankPaletteMatches(labels, (label) => paletteMatchScore(label, ' MORE ')),
      [
        'More settings',
        'More actions',
        'Open more',
        'Show more',
        'Make October easier',
      ],
    );
    expect(paletteMatchScore('Chuyển không gian', 'không'), 2);
  });

  test('shows available recents before the catalog for an empty query', () {
    const home = PaletteEntry(
      id: 'home',
      label: 'Home',
      group: PaletteGroup.destinations,
      route: '/',
    );
    const apps = PaletteEntry(
      id: 'apps',
      label: 'Apps',
      group: PaletteGroup.destinations,
      route: '/apps',
    );
    final ordered = rankPaletteCommands(
      [home, apps],
      '',
      ['unavailable', 'apps', 'apps'],
    );
    expect(ordered.map((entry) => entry.id), ['apps', 'home']);
    expect(ordered.first.group, PaletteGroup.recent);
    expect(rankPaletteCommands([home, apps], 'ho', ['apps']), [home]);
  });
}
