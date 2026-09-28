import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';

void main() {
  PendingMutationRecord mutation(
    String method,
    String id, {
    Map<String, dynamic>? payload,
    String workspaceId = 'ws_1',
  }) => PendingMutationRecord(
    id: '$method-$id',
    feature: 'education',
    method: method,
    path: '/api/v1/workspaces/$workspaceId/courses/$id',
    createdAt: DateTime.utc(2026, 9, 28),
    userId: 'user_1',
    workspaceId: workspaceId,
    payload: payload,
    optimisticPatch: {'entityId': id},
  );

  test('overlays creates, updates, deletes and keeps workspaces isolated', () {
    final pending = [
      mutation('PUT', 'course_1', payload: {'name': 'Updated'}),
      mutation('POST', 'local_1', payload: {'name': 'New'}),
      mutation('DELETE', 'course_2'),
      mutation(
        'POST',
        'other_1',
        payload: {'name': 'Other'},
        workspaceId: 'ws_2',
      ),
    ];
    final rows = overlayPendingCollection(
      workspaceId: 'ws_1',
      feature: 'education',
      pathContains: '/courses',
      source: const [
        {'id': 'course_1', 'name': 'Original'},
        {'id': 'course_2', 'name': 'Deleted'},
      ],
      pending: pending,
    );
    expect(rows.map((row) => row['id']), ['course_1', 'local_1']);
    expect(rows.first['name'], 'Updated');
  });

  test('respects query matching and hides new rows on later pages', () {
    final pending = [
      mutation('POST', 'local_1', payload: {'name': 'New'}),
    ];
    final rows = overlayPendingCollection(
      workspaceId: 'ws_1',
      feature: 'education',
      pathContains: '/courses',
      source: const [],
      pending: pending,
      matchesQuery: (row) => (row['name'] as String).contains('Other'),
    );
    expect(rows, isEmpty);
    expect(
      overlayPendingCollection(
        workspaceId: 'ws_1',
        feature: 'education',
        pathContains: '/courses',
        source: const [],
        pending: pending,
        includeCreates: false,
      ),
      isEmpty,
    );
  });
}
