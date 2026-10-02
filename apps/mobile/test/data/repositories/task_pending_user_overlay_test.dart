import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/user_tasks_page.dart';
import 'package:mobile/data/repositories/task_pending_user_overlay.dart';

void main() {
  final now = DateTime(2026, 10, 2, 12);
  const source = UserTasksPage(
    overdue: [],
    today: [UserTask(id: 'one', name: 'Original')],
    upcoming: [UserTask(id: 'two')],
    completed: [],
    totalActiveTasks: 2,
    totalCompletedTasks: 0,
    hasMoreCompleted: false,
    completedPage: 0,
  );
  PendingMutationRecord mutation(
    String method,
    String id,
    Map<String, dynamic> payload, {
    String userId = 'me',
    String? path,
  }) => PendingMutationRecord(
    id: '$method-$id',
    feature: 'tasks',
    method: method,
    path: path ?? '/api/v1/workspaces/ws/tasks/$id',
    workspaceId: 'ws',
    userId: userId,
    payload: payload,
    createdAt: now,
    optimisticPatch: {'entityId': id},
  );
  UserTasksPage project(List<PendingMutationRecord> pending) =>
      overlayPendingUserTasks(
        workspaceId: 'ws',
        userId: 'me',
        source: source,
        pending: pending,
        now: now,
      );
  test('queued completion and deletion update buckets and totals', () {
    final result = project([
      mutation('PUT', 'one', {'name': 'Changed', 'completed': true}),
      mutation('DELETE', 'two', {}),
    ]);
    expect(result.completed.single.name, 'Changed');
    expect(result.totalActiveTasks, 0);
    expect(result.totalCompletedTasks, 1);
  });
  test('date updates rebucket changed rows and keep untouched buckets', () {
    final result = project([
      mutation('PUT', 'two', {'end_date': '2026-10-01T10:00:00'}),
    ]);
    expect(result.overdue.single.id, 'two');
    expect(result.today.single.id, 'one');
  });
  test('local creates require current user assignment', () {
    final result = project([
      mutation('POST', 'mine', {
        'name': 'Local',
        'assignee_ids': ['me'],
      }, path: '/api/v1/workspaces/ws/tasks'),
      mutation('POST', 'other', {
        'assignee_ids': ['other'],
      }, path: '/api/v1/workspaces/ws/tasks'),
    ]);
    expect(result.upcoming.map((task) => task.id), ['two', 'mine']);
    expect(result.totalActiveTasks, 3);
  });
  test('other users and task subresources cannot alter buckets', () {
    expect(
      project([
        mutation('DELETE', 'one', {}, userId: 'other'),
        mutation(
          'DELETE',
          'two',
          {},
          path: '/api/v1/workspaces/ws/tasks/two/relationships',
        ),
      ]),
      source,
    );
  });
  test('queued bulk field changes rebucket all matching user tasks', () {
    final result = project([
      mutation('POST', 'bulk', {
        'taskIds': ['one', 'two'],
        'operation': {
          'type': 'update_fields',
          'updates': {'completed': true},
        },
      }, path: '/api/v1/workspaces/ws/tasks/bulk'),
    ]);
    expect(result.completed.map((task) => task.id), ['one', 'two']);
    expect(result.totalActiveTasks, 0);
  });
  test(
    'same-day past due edits are overdue and far future edits leave upcoming',
    () {
      final past = project([
        mutation('PUT', 'two', {'end_date': '2026-10-02T10:00:00'}),
      ]);
      expect(past.overdue.single.id, 'two');
      final far = project([
        mutation('PUT', 'two', {'end_date': '2026-11-02T10:00:00'}),
      ]);
      expect(far.upcoming, isEmpty);
    },
  );
  test(
    'bulk destination metadata classifies review and removes closed lists',
    () {
      UserTasksPage move(String status) => overlayPendingUserTasks(
        workspaceId: 'ws',
        userId: 'me',
        source: source,
        now: now,
        cachedLists: [
          {'id': 'destination', 'status': status},
        ],
        pending: [
          mutation('PUT', 'bulk', {
            'taskIds': ['one'],
            'operation': {'type': 'move_to_list', 'listId': 'destination'},
          }, path: '/api/v1/workspaces/ws/tasks/bulk'),
        ],
      );
      expect(move('review').completed.single.id, 'one');
      expect(move('closed').today, isEmpty);
    },
  );
}
