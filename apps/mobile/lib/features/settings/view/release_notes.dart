import 'dart:convert';

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

/// Release Please owns CHANGELOG.md. Store builds bundle patch history so the
/// installed app can show its actual changes while offline.
class MobileReleaseNotes {
  MobileReleaseNotes._();

  static Future<List<MobileReleaseNote>>? _cached;

  static Future<List<MobileReleaseNote>> load() => _cached ??= Future.wait([
    rootBundle.loadString('CHANGELOG.md'),
    rootBundle.loadString('assets/release_history.json'),
  ]).then((assets) => combine(assets[0], assets[1]));

  static List<MobileReleaseNote> combine(String markdown, String json) {
    final published = parse(markdown);
    final patchReleases =
        (jsonDecode(json) as Map<String, dynamic>)['releases'];
    final byVersion = <String, MobileReleaseNote>{
      for (final release in published) release.version: release,
    };
    if (patchReleases is List) {
      for (final item in patchReleases) {
        if (item is! Map<String, dynamic>) continue;
        final version = item['version'];
        final date = DateTime.tryParse(item['date']?.toString() ?? '');
        final changes = item['changes'];
        if (version is! String || date == null || changes is! List) continue;
        byVersion[version] = MobileReleaseNote(
          version: version,
          date: date,
          changes: List.unmodifiable(changes.whereType<String>()),
        );
      }
    }
    final versions = byVersion.keys.toList()
      ..sort((a, b) {
        final left = a.split('.').map(int.tryParse).toList();
        final right = b.split('.').map(int.tryParse).toList();
        for (var i = 0; i < 3; i++) {
          final difference =
              (right.elementAtOrNull(i) ?? 0) - (left.elementAtOrNull(i) ?? 0);
          if (difference != 0) return difference;
        }
        return 0;
      });
    return List.unmodifiable(versions.map((version) => byVersion[version]!));
  }

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
