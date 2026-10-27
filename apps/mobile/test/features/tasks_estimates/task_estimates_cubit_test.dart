import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'malformed API flags become an error state instead of an uncaught cast',
    () async {
      final api = _Api();
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'boards': [
            {'id': 'board-1', 'extended_estimation': 'true'},
          ],
        },
      );
      final cubit = TaskEstimatesCubit(
        taskRepository: TaskRepository(apiClient: api),
      );
      addTearDown(cubit.close);
      await cubit.loadBoards('malformed');
      expect(cubit.state.status, TaskEstimatesStatus.error);
      expect(cubit.state.boards, isEmpty);
    },
  );

  test('leaving estimations while loading ignores the late response', () async {
    final api = _Api();
    final response = Completer<Map<String, dynamic>>();
    final started = Completer<void>();
    when(() => api.getJson(any())).thenAnswer((_) {
      started.complete();
      return response.future;
    });
    final cubit = TaskEstimatesCubit(
      taskRepository: TaskRepository(apiClient: api),
    );
    final load = cubit.loadBoards('leaving');
    await started.future;
    await cubit.close();
    response.complete({'boards': <dynamic>[]});
    await load;
  });
  test(
    'invalid cached boards are dropped before synchronous route seeding',
    () async {
      final key = CacheKey(
        namespace: 'tasks.estimates',
        userId: currentCacheUserId(),
        workspaceId: 'invalid-seed',
        locale: currentCacheLocaleTag(),
      );
      await CacheStore.instance.write(
        key: key,
        policy: CachePolicies.moduleData,
        payload: {
          'boards': [
            {'id': 'board-1', 'extended_estimation': 'true'},
          ],
        },
      );
      final errors = <FlutterErrorDetails>[];
      final previous = FlutterError.onError;
      FlutterError.onError = errors.add;
      try {
        expect(TaskEstimatesCubit.seedStateFor('invalid-seed'), isNull);
        expect(errors, hasLength(1));
        expect(errors.single.exception, isA<FormatException>());
      } finally {
        FlutterError.onError = previous;
        await CacheStore.instance.remove(key);
      }
    },
  );

  for (final closeBeforeRejection in [false, true]) {
    test('400 save still throws after close=$closeBeforeRejection', () async {
      final api = _Api();
      final response = Completer<Map<String, dynamic>>();
      final started = Completer<void>();
      when(
        () => api.getJson(any()),
      ).thenAnswer((_) async => {'boards': <dynamic>[]});
      when(() => api.patchJson(any(), any())).thenAnswer((_) {
        started.complete();
        return response.future;
      });
      final cubit = TaskEstimatesCubit(
        taskRepository: TaskRepository(apiClient: api),
      );
      addTearDown(cubit.close);
      await cubit.loadBoards('save-original');
      final save = cubit.updateBoardEstimation(
        wsId: 'save-original',
        boardId: 'board-1',
        estimationType: 't-shirt',
        extendedEstimation: true,
        allowZeroEstimates: true,
        countUnestimatedIssues: false,
      );
      await started.future;
      if (closeBeforeRejection) {
        await cubit.close();
      } else {
        await cubit.loadBoards('save-next');
      }
      const rejection = ApiException(message: 'Rejected', statusCode: 400);
      final assertion = expectLater(save, throwsA(same(rejection)));
      response.completeError(rejection);
      await assertion;
      if (!closeBeforeRejection) {
        expect(cubit.state.status, TaskEstimatesStatus.loaded);
        expect(cubit.state.error, isNull);
      }
    });
  }

  for (final invalidJson in [false, true]) {
    test(
      'successful PATCH refetches invalidJson=$invalidJson without replay',
      () async {
        final api = _Api();
        var reads = 0;
        when(() => api.getJson(any())).thenAnswer((_) async {
          reads++;
          return {
            'boards': [
              {
                'id': 'board-1',
                'name': 'Tasks',
                'estimation_type': reads == 1 ? 'fibonacci' : 't-shirt',
                'extended_estimation': reads != 1,
              },
            ],
          };
        });
        when(() => api.patchJson(any(), any())).thenAnswer((_) async {
          if (invalidJson) {
            throw const ApiException(
              message: 'Expected a JSON object response',
              statusCode: 0,
              failureKind: ApiFailureKind.response,
            );
          }
          return {'id': 'board-1', 'extended_estimation': 'invalid'};
        });
        final cubit = TaskEstimatesCubit(
          taskRepository: TaskRepository(apiClient: api),
        );
        addTearDown(cubit.close);
        await cubit.loadBoards('save-invalid-body');
        await cubit.updateBoardEstimation(
          wsId: 'save-invalid-body',
          boardId: 'board-1',
          estimationType: 't-shirt',
          extendedEstimation: true,
          allowZeroEstimates: true,
          countUnestimatedIssues: false,
        );
        expect(cubit.state.status, TaskEstimatesStatus.loaded);
        expect(cubit.state.boards.single.estimationType, 't-shirt');
        expect(cubit.state.boards.single.extendedEstimation, isTrue);
        expect(cubit.state.boards.single.name, 'Tasks');
        expect(reads, 2);
        verify(() => api.patchJson(any(), any())).called(1);
      },
    );
  }
}
