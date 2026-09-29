import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'board estimates overlay their queued settings without losing identity',
    () async {
      final api = _MockApiClient();
      final repository = TaskRepository(apiClient: api);
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'boards': [
            {
              'id': 'board-1',
              'name': 'Product',
              'created_at': '2026-09-29T00:00:00Z',
              'estimation_type': 'points',
              'extended_estimation': false,
            },
          ],
        },
      );
      OfflineMutationQueue.instance.pending.value = [
        PendingMutationRecord(
          id: 'edit-1',
          feature: 'tasks',
          method: 'PATCH',
          path: '/api/v1/workspaces/ws-1/boards/board-1/estimation',
          createdAt: DateTime.utc(2026, 9, 29),
          userId: 'user-1',
          workspaceId: 'ws-1',
          payload: const {
            'estimation_type': 't_shirt',
            'extended_estimation': true,
            'allow_zero_estimates': false,
            'count_unestimated_issues': true,
          },
          optimisticPatch: const {'entityId': 'board-1'},
        ),
      ];

      final board = (await repository.getTaskEstimateBoards('ws-1')).single;
      expect(board.name, 'Product');
      expect(board.estimationType, 't_shirt');
      expect(board.extendedEstimation, isTrue);
      expect(
        (await repository.getTaskEstimateBoards('ws-2')).single.estimationType,
        'points',
      );
      OfflineMutationQueue.instance.pending.value = [];
    },
  );
}
