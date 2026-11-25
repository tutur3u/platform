enum PaletteGroup { recent, destinations, apps, actions, search }

enum PaletteAction { newChat, newTask, toggleTheme, switchWorkspace, shortcuts }

enum PaletteRecordKind { task, note }

class PaletteEntry {
  const PaletteEntry({
    required this.id,
    required this.label,
    required this.group,
    this.route,
    this.action,
    this.appId,
    this.recordKind,
    this.shortcut,
  }) : assert((route == null) != (action == null));

  final String id;
  final String label;
  final PaletteGroup group;
  final String? route;
  final PaletteAction? action;
  final String? appId;
  final PaletteRecordKind? recordKind;
  final String? shortcut;
}

final _wordBoundary = RegExp(r'[^\p{L}\p{N}]+', unicode: true);
final _spacing = RegExp(r'\s+');

String normalizePaletteQuery(String value) =>
    value.trim().toLowerCase().replaceAll(_spacing, ' ');

/// Scores the strongest match. A score of zero excludes the candidate.
int paletteMatchScore(String text, String query) {
  final candidate = normalizePaletteQuery(text);
  final needle = normalizePaletteQuery(query);
  if (needle.isEmpty || candidate.startsWith(needle)) return 3;
  final wordStart = _wordBoundary
      .allMatches(candidate)
      .any((boundary) => candidate.startsWith(needle, boundary.end));
  if (wordStart) return 2;

  var index = 0;
  for (final unit in candidate.codeUnits) {
    if (unit == needle.codeUnitAt(index)) index++;
    if (index == needle.length) return 1;
  }
  return 0;
}

List<T> rankPaletteMatches<T>(
  Iterable<T> items,
  int Function(T item) score,
) {
  final matches = [
    for (final (index, item) in items.indexed)
      (item: item, score: score(item), index: index),
  ]..removeWhere((match) => match.score == 0);
  matches.sort((a, b) {
    final byScore = b.score.compareTo(a.score);
    return byScore == 0 ? a.index.compareTo(b.index) : byScore;
  });
  return [for (final match in matches) match.item];
}
