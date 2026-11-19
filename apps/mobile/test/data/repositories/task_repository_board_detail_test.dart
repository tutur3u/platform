import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

const _base = '/api/v1/workspaces/ws-1';
const _boardPath = '$_base/task-boards/board-1';
const _listsPath = '$_base/task-boards/board-1/lists';
const _labelsPath = '$_base/labels';
const _membersPath = '$_base/members';
const _projectsPath = '$_base/task-projects';
const _estimationPath = '$_base/boards/estimation';

const Map<TaskBoardDetailPart, String> _partPaths = {
  TaskBoardDetailPart.labels: _labelsPath,
  TaskBoardDetailPart.members: _membersPath,
  TaskBoardDetailPart.projects: _projectsPath,
  TaskBoardDetailPart.estimation: _estimationPath,
};

/// Serves a one-list board; a path in [failures] throws its error instead.
class _BoardApi {
  _BoardApi() {
    when(() => api.getJson(any())).thenAnswer((call) {
      final path = call.positionalArguments.first as String;
      calls[path] = (calls[path] ?? 0) + 1;
      return _respond(path, () async => _json[path]!);
    });
    when(() => api.getJsonList(any())).thenAnswer((call) {
      final path = call.positionalArguments.first as String;
      calls[path] = (calls[path] ?? 0) + 1;
      return _respond(path, () async => _lists[path]!);
    });
  }

  final api = _MockApiClient();
  final Map<String, int> calls = {};

  /// Errors to throw per path, consumed one per call.
  final Map<String, List<Object>> failures = {};

  /// Paths whose next call never completes.
  final Set<String> hangOnce = {};

  Future<T> _respond<T>(String path, Future<T> Function() value) {
    if (hangOnce.remove(path)) return Completer<T>().future;
    final queued = failures[path];
    if (queued != null && queued.isNotEmpty) {
      return Future<T>.error(queued.removeAt(0));
    }
    return value();
  }

  static const Map<String, Map<String, dynamic>> _json = {
    _boardPath: {
      'board': {'id': 'board-1', 'ws_id': 'ws-1', 'name': 'Roadmap'},
    },
    _listsPath: {
      'lists': [
        {'id': 'list-1', 'board_id': 'board-1', 'name': 'Todo'},
      ],
    },
    _membersPath: {
      'members': [
        {'id': 'user-1', 'display_name': 'Lan'},
      ],
    },
    _estimationPath: {
      'boards': [
        {'id': 'board-1', 'estimation_type': 'fibonacci'},
      ],
    },
  };

  static const Map<String, List<dynamic>> _lists = {
    _labelsPath: [
      {'id': 'label-1', 'ws_id': 'ws-1', 'name': 'Bug', 'color': '#EF4444'},
    ],
    _projectsPath: [
      {'id': 'project-1', 'name': 'Launch'},
    ],
  };
}

ApiException _serverError() =>
    const ApiException(message: 'Upstream failed', statusCode: 502);

TaskRepository _repository(_BoardApi server) => TaskRepository(
  apiClient: server.api,
  boardDetailLoadPolicy: const TaskBoardDetailLoadPolicy(
    requestTimeout: Duration(milliseconds: 200),
    retryDelay: Duration(milliseconds: 10),
  ),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('a complete board reports no unavailable parts', () async {
    final server = _BoardApi();
    final detail = await _repository(
      server,
    ).getTaskBoardDetail('ws-1', 'board-1');

    expect(detail.name, 'Roadmap');
    expect(detail.lists.single.id, 'list-1');
    expect(detail.labels.single.id, 'label-1');
    expect(detail.members.single.id, 'user-1');
    expect(detail.projects.single.id, 'project-1');
    expect(detail.estimationType, 'fibonacci');
    expect(detail.unavailableParts, isEmpty);
  });

  for (final MapEntry(key: part, value: path) in _partPaths.entries) {
    test('a failed ${part.name} read still returns the board', () async {
      final server = _BoardApi()
        ..failures[path] = [const FormatException('Unexpected shape')];
      final detail = await _repository(
        server,
      ).getTaskBoardDetail('ws-1', 'board-1');

      expect(detail.lists.single.id, 'list-1');
      expect(detail.unavailableParts, {part});
      expect(server.calls[path], 1);
      expect(
        part == TaskBoardDetailPart.labels
            ? detail.labels
            : part == TaskBoardDetailPart.members
            ? detail.members
            : part == TaskBoardDetailPart.projects
            ? detail.projects
            : [?detail.estimationType],
        isEmpty,
      );
    });
  }

  test('a denied board read fails without a retry', () async {
    final server = _BoardApi()
      ..failures[_boardPath] = [
        const ApiException(message: 'Forbidden', statusCode: 403),
      ];

    await expectLater(
      _repository(server).getTaskBoardDetail('ws-1', 'board-1'),
      throwsA(isA<ApiException>()),
    );
    expect(server.calls[_boardPath], 1);
  });

  test('a board read that fails twice fails the load', () async {
    final server = _BoardApi()
      ..failures[_boardPath] = [_serverError(), _serverError()];

    await expectLater(
      _repository(server).getTaskBoardDetail('ws-1', 'board-1'),
      throwsA(isA<ApiException>()),
    );
    expect(server.calls[_boardPath], 2);
  });

  test('a server error on the lists read retries once', () async {
    final server = _BoardApi()..failures[_listsPath] = [_serverError()];
    final detail = await _repository(
      server,
    ).getTaskBoardDetail('ws-1', 'board-1');

    expect(detail.lists.single.id, 'list-1');
    expect(server.calls[_listsPath], 2);
  });

  test(
    'a timed-out required read retries and a slow part is skipped',
    () async {
      final server = _BoardApi()..hangOnce.addAll({_boardPath, _membersPath});
      final detail = await _repository(
        server,
      ).getTaskBoardDetail('ws-1', 'board-1');

      expect(detail.name, 'Roadmap');
      expect(server.calls[_boardPath], 2);
      expect(detail.members, isEmpty);
      expect(detail.unavailableParts, {TaskBoardDetailPart.members});
    },
  );

  test('reloading parts fills only the parts that load', () async {
    final server = _BoardApi()
      ..failures[_labelsPath] = [_serverError()]
      ..failures[_projectsPath] = [_serverError(), _serverError()];
    final repository = _repository(server);
    final degraded = await repository.getTaskBoardDetail('ws-1', 'board-1');
    expect(degraded.unavailableParts, {
      TaskBoardDetailPart.labels,
      TaskBoardDetailPart.projects,
    });

    final reloaded = await repository.reloadTaskBoardDetailParts(degraded);

    expect(reloaded.labels.single.id, 'label-1');
    expect(reloaded.projects, isEmpty);
    expect(reloaded.unavailableParts, {TaskBoardDetailPart.projects});
    expect(server.calls[_membersPath], 1);
    expect(server.calls[_estimationPath], 1);
  });
}
