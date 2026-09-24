import 'package:flutter/services.dart';

class MobileReleaseNote {
  const MobileReleaseNote({
    required this.version,
    required this.date,
    required this.changes,
  });

  final String version;
  final DateTime date;
  final List<String> changes;
}

/// Release Please owns CHANGELOG.md; bundling it keeps history offline and
/// avoids a request, a second store, or per-build hand-maintained copies.
class MobileReleaseNotes {
  MobileReleaseNotes._();

  static Future<List<MobileReleaseNote>>? _cached;

  static Future<List<MobileReleaseNote>> load() =>
      _cached ??= rootBundle.loadString('CHANGELOG.md').then(parse);

  static List<MobileReleaseNote> parse(String markdown) {
    final heading = RegExp(r'^## \[([^\]]+)\].*?\((\d{4}-\d{2}-\d{2})\)\s*$');
    final markdownLink = RegExp(r'\[([^\]]+)\]\([^)]*\)');
    final trailingReference = RegExp(r'\s*\((?:#?\d+|[a-f0-9]{7,})\)');
    final releases = <MobileReleaseNote>[];
    String? version;
    DateTime? date;
    var changes = <String>[];

    void finish() {
      if (version != null && date != null) {
        releases.add(
          MobileReleaseNote(
            version: version,
            date: date,
            changes: List.unmodifiable(changes),
          ),
        );
      }
    }

    for (final raw in markdown.split('\n')) {
      final line = raw.trim();
      final match = heading.firstMatch(line);
      if (match != null) {
        finish();
        version = match.group(1);
        date = DateTime.tryParse(match.group(2)!);
        changes = <String>[];
        continue;
      }
      if (version == null || !line.startsWith('* ')) continue;
      final description = line
          .substring(2)
          .replaceAllMapped(markdownLink, (match) => match.group(1)!)
          .replaceAll(trailingReference, '')
          .replaceAll(RegExp(r'^\*\*[^*]+:\*\*\s*'), '')
          .trim();
      if (description.isNotEmpty && !changes.contains(description)) {
        changes.add(description);
      }
    }
    finish();
    return List.unmodifiable(releases);
  }
}
