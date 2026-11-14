import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mocktail/mocktail.dart';

import 'task_board_row_actions_fixture.dart';

class _Client extends Mock implements HttpClient {}

/// An assignee avatar in the list view's 24x24 circle decodes at that circle's
/// device-pixel size instead of the avatar's source resolution.
class _AssigneeAvatarRepository extends RowActionsRepository {
  static const _task = TaskBoardTask(
    id: 'task-1',
    listId: 'list-1',
    name: 'Avatar task',
    assignees: [
      TaskBoardTaskAssignee(
        id: 'user-1',
        displayName: 'Lan',
        avatarUrl: 'https://example.test/avatar.png',
      ),
    ],
  );

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async => (await super.getTaskBoardDetail(
    wsId,
    boardId,
  )).copyWith(tasks: const [_task]);

  @override
  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const <WorkspaceUserOption>[],
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) async =>
      offset > 0 || listId != 'list-1' ? const <TaskBoardTask>[] : [_task];
}

void main() {
  setUpAll(() {
    registerFallbackValue(Uri.parse('https://example.invalid/avatar'));
  });

  testWidgets('assignee avatar decodes at the 24x24 circle size', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetDevicePixelRatio);
    final previous = debugNetworkImageHttpClientProvider;
    final client = _Client();
    when(() => client.getUrl(any())).thenAnswer(
      (_) async => throw const SocketException('Synthetic offline avatar'),
    );
    debugNetworkImageHttpClientProvider = () => client;
    try {
      await pumpRowActionsBoard(
        tester,
        workspaceCubit: rowActionsWorkspaceCubit(),
        repository: _AssigneeAvatarRepository(),
      );

      final rowImages = find.descendant(
        of: taskRow('Avatar task'),
        matching: find.byType(Image),
      );
      expect(rowImages, findsOneWidget);
      final provider = tester.widget<Image>(rowImages).image;
      expect(provider, isA<ResizeImage>());
      final resized = provider as ResizeImage;
      // 24 logical px × dpr 3 = 72 device px, rounded up.
      expect(resized.width, 72);
      expect(resized.height, isNull);
      expect(resized.imageProvider, isA<NetworkImage>());
      expect(tester.takeException(), isNull);
    } finally {
      debugNetworkImageHttpClientProvider = previous;
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    }
  });
}
