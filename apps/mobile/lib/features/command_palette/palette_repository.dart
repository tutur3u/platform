import 'dart:math' as math;

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/command_palette/palette_entry.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/features/notes/notes_offline_preparation.dart';
import 'package:shared_preferences/shared_preferences.dart';

typedef PaletteRecord = ({
  String id,
  String title,
  String searchableBody,
  String route,
  PaletteRecordKind kind,
});

typedef PaletteSearchResult = ({List<PaletteRecord> records, bool failed});

abstract interface class PaletteRepository {
  Future<PaletteSearchResult> search(String query);
}

abstract interface class PaletteRecents {
  Future<List<String>> read();
  Future<void> remember(String id);
}

class DevicePaletteRecents implements PaletteRecents {
  const DevicePaletteRecents(this.actor);

  final String actor;

  String get _key => 'command-palette.recent.$actor';

  @override
  Future<List<String>> read() async =>
      (await SharedPreferences.getInstance()).getStringList(_key) ?? const [];

  @override
  Future<void> remember(String id) async {
    final preferences = await SharedPreferences.getInstance();
    final ids = preferences.getStringList(_key) ?? const <String>[];
    await preferences.setStringList(_key, {id, ...ids}.take(8).toList());
  }
}

/// A snapshot belongs to one palette opening and its captured workspace.
class WorkspacePaletteRepository implements PaletteRepository {
  WorkspacePaletteRepository({
    required this.workspaceId,
    required this.actor,
    required this.isCurrent,
    required this.tasks,
    required this.notes,
    required this.prepareNotes,
  });

  final String workspaceId;
  final String actor;
  final bool Function() isCurrent;
  final TaskRepository tasks;
  final NoteRepository? notes;
  final NotesOfflinePreparation? prepareNotes;
  Future<List<PaletteRecord>?>? _taskSnapshot;
  Future<List<PaletteRecord>?>? _noteSnapshot;

  @override
  Future<PaletteSearchResult> search(String query) async {
    if (!isCurrent()) return (records: const <PaletteRecord>[], failed: false);
    final taskRequest = _taskSnapshot ??= _loadTasks();
    final noteRequest = _noteSnapshot ??= _loadNotes();
    final rows = await Future.wait([taskRequest, noteRequest]);
    final [taskRows, noteRows] = rows;
    if (taskRows == null && identical(_taskSnapshot, taskRequest)) {
      _taskSnapshot = null;
    }
    if (noteRows == null && identical(_noteSnapshot, noteRequest)) {
      _noteSnapshot = null;
    }
    return (
      records: rankPaletteMatches(
        [...?taskRows, ...?noteRows],
        (record) => math.max(
          paletteMatchScore(record.title, query),
          math.min(1, paletteMatchScore(record.searchableBody, query)),
        ),
      ).take(12).toList(),
      failed: taskRows == null || noteRows == null,
    );
  }

  Future<List<PaletteRecord>?> _loadTasks() async {
    try {
      final rows = await tasks.getTasks(workspaceId);
      return [
        for (final task in rows)
          if (task.boardId case final boardId? when boardId.isNotEmpty)
            (
              id: task.id,
              title: task.name ?? '',
              searchableBody: task.description ?? '',
              route: Routes.taskBoardTaskDetailPath(boardId, task.id),
              kind: PaletteRecordKind.task,
            ),
      ];
    } on Object {
      return null;
    }
  }

  Future<List<PaletteRecord>?> _loadNotes() async {
    final repository = notes;
    if (repository == null) return const [];
    // Use the account-fenced loader to populate the note repository's cache.
    var prepared = false;
    try {
      await prepareNotes?.prepare(workspaceId);
      prepared = true;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) return null;
    } on Object {
      if (!isCurrent()) return null;
    }
    if (!isCurrent() || currentCacheUserId() != actor) return null;
    try {
      final cached = await repository.cached(workspaceId);
      if (!isCurrent() || currentCacheUserId() != actor) return null;
      if (!prepared && cached.isEmpty) return null;
      return _noteRecords(cached);
    } on Object {
      return null;
    }
  }

  List<PaletteRecord> _noteRecords(List<NoteRecord> rows) => [
    for (final note in rows)
      if (note.id.isNotEmpty)
        (
          id: note.id,
          title: note.title,
          searchableBody: note.preview,
          route: Routes.noteDetailPath(note.id),
          kind: PaletteRecordKind.note,
        ),
  ];
}
