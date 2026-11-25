import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/data/models/task.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/command_palette/palette_entry.dart';
import 'package:mobile/features/command_palette/palette_repository.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/features/notes/notes_offline_preparation.dart';
import 'package:mocktail/mocktail.dart';

class _Tasks extends Mock implements TaskRepository {}

class _Notes extends Mock implements NoteRepository {}

class _Preparation extends Mock implements NotesOfflinePreparation {}

const _task = Task(id: 'task-1', name: 'Plan launch', boardId: 'board');
const _noBoardTask = Task(id: 'task-2', name: 'Plan hidden');
const _note = NoteRecord(
  id: 'note-1',
  title: 'Plan notes',
  content: {'type': 'doc', 'content': <Object>[]},
  updatedAt: null,
  archived: false,
);

ApiException _http(int status) =>
    ApiException(message: 'status $status', statusCode: status);

void main() {
  late _Tasks tasks;
  late _Notes notes;
  late _Preparation preparation;
  var current = true;
  String? cacheUser = 'actor';

  WorkspacePaletteRepository build({bool withNotes = true}) =>
      WorkspacePaletteRepository(
        workspaceId: 'workspace',
        actor: 'actor',
        isCurrent: () => current,
        tasks: tasks,
        notes: withNotes ? notes : null,
        prepareNotes: withNotes ? preparation : null,
      );

  setUp(() {
    current = true;
    cacheUser = 'actor';
    debugCacheUserIdOverride = () => cacheUser;
    tasks = _Tasks();
    notes = _Notes();
    preparation = _Preparation();
    when(
      () => tasks.getTasks('workspace'),
    ).thenAnswer((_) async => const [_task, _noBoardTask]);
    when(() => preparation.prepare('workspace')).thenAnswer((_) async {});
    when(() => notes.cached('workspace')).thenAnswer((_) async => [_note]);
  });
  tearDown(() => debugCacheUserIdOverride = null);

  Set<String> ids(PaletteSearchResult result) => {
    for (final record in result.records) record.id,
  };

  test(
    'returns tasks with a board and notes, and skips boardless tasks',
    () async {
      final result = await build().search('plan');

      expect(ids(result), {'task-1', 'note-1'});
      expect(result.failed, isFalse);
      expect(
        result.records.firstWhere((r) => r.id == 'task-1').kind,
        PaletteRecordKind.task,
      );
    },
  );

  test('without a note repository only tasks load and nothing fails', () async {
    final result = await build(withNotes: false).search('plan');

    expect(ids(result), {'task-1'});
    expect(result.failed, isFalse);
    verifyNever(() => notes.cached(any()));
  });

  test('a closed palette loads nothing', () async {
    current = false;

    final result = await build().search('plan');

    expect(result.records, isEmpty);
    expect(result.failed, isFalse);
    verifyNever(() => tasks.getTasks(any()));
    verifyNever(() => preparation.prepare(any()));
  });

  for (final status in [401, 403]) {
    test(
      'a $status while preparing notes hides them and reports failure',
      () async {
        when(() => preparation.prepare('workspace')).thenThrow(_http(status));

        final result = await build().search('plan');

        expect(ids(result), {'task-1'});
        expect(result.failed, isTrue);
        verifyNever(() => notes.cached(any()));
      },
    );
  }

  test('a transient preparation error serves a populated cache', () async {
    when(() => preparation.prepare('workspace')).thenThrow(_http(500));

    final result = await build().search('plan');

    expect(ids(result), {'task-1', 'note-1'});
    expect(result.failed, isFalse);
  });

  test(
    'a transient preparation error with an empty cache fails notes',
    () async {
      when(() => preparation.prepare('workspace')).thenThrow(_http(500));
      when(() => notes.cached('workspace')).thenAnswer((_) async => const []);

      final result = await build().search('plan');

      expect(ids(result), {'task-1'});
      expect(result.failed, isTrue);
    },
  );

  test(
    'notes are dropped when the palette closes during preparation',
    () async {
      when(() => preparation.prepare('workspace')).thenAnswer((_) async {
        current = false;
      });

      final result = await build().search('plan');

      expect(ids(result), {'task-1'});
      expect(result.failed, isTrue);
      verifyNever(() => notes.cached(any()));
    },
  );

  test('notes are dropped when another account became current', () async {
    when(() => preparation.prepare('workspace')).thenAnswer((_) async {
      cacheUser = 'someone-else';
    });

    final result = await build().search('plan');

    expect(ids(result), {'task-1'});
    expect(result.failed, isTrue);
    verifyNever(() => notes.cached(any()));
  });

  test('notes read from cache are dropped when the actor changes', () async {
    when(() => notes.cached('workspace')).thenAnswer((_) async {
      cacheUser = 'someone-else';
      return [_note];
    });

    final result = await build().search('plan');

    expect(ids(result), {'task-1'});
    expect(result.failed, isTrue);
  });

  test('notes read from cache are dropped when the palette closes', () async {
    when(() => notes.cached('workspace')).thenAnswer((_) async {
      current = false;
      return [_note];
    });

    final result = await build().search('plan');

    expect(ids(result), {'task-1'});
    expect(result.failed, isTrue);
  });

  test(
    'a failed snapshot is retried on the next search and a good one is kept',
    () async {
      var taskCalls = 0;
      when(() => tasks.getTasks('workspace')).thenAnswer((_) async {
        taskCalls++;
        if (taskCalls == 1) throw StateError('offline');
        return const [_task];
      });
      final repository = build();

      final first = await repository.search('plan');
      expect(ids(first), {'note-1'});
      expect(first.failed, isTrue);

      final second = await repository.search('plan');
      expect(ids(second), {'task-1', 'note-1'});
      expect(second.failed, isFalse);

      await repository.search('launch');
      expect(taskCalls, 2);
      verify(() => preparation.prepare('workspace')).called(1);
    },
  );

  test('a failed note snapshot is retried without reloading tasks', () async {
    var prepareCalls = 0;
    when(() => preparation.prepare('workspace')).thenAnswer((_) async {
      prepareCalls++;
      if (prepareCalls == 1) throw _http(401);
    });
    final repository = build();

    expect((await repository.search('plan')).failed, isTrue);
    final retried = await repository.search('plan');

    expect(ids(retried), {'task-1', 'note-1'});
    expect(retried.failed, isFalse);
    expect(prepareCalls, 2);
    verify(() => tasks.getTasks('workspace')).called(1);
  });
}
