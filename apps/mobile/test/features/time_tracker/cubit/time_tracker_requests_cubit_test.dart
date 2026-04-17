import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_state.dart';
import 'package:mocktail/mocktail.dart';

class _MockTimeTrackerRepository extends Mock
    implements ITimeTrackerRepository {}

void main() {
  group('TimeTrackerRequestsCubit', () {
    late _MockTimeTrackerRepository repository;

    setUp(() async {
      repository = _MockTimeTrackerRepository();
      await CacheStore.instance.clearScope();
    });

    setUpAll(() async {
      await CacheStore.instance.init();
    });

    tearDown(() async {
      await CacheStore.instance.clearScope();
    });

    blocTest<TimeTrackerRequestsCubit, TimeTrackerRequestsState>(
      'filters approved requests correctly',
      build: () {
        when(
          () => repository.getRequests(
            'ws_1',
            status: 'approved',
            userId: any(named: 'userId'),
            limit: any(named: 'limit'),
            offset: any(named: 'offset'),
          ),
        ).thenAnswer(
          (_) async => [_request('req_approved', ApprovalStatus.approved)],
        );

        return TimeTrackerRequestsCubit(repository: repository);
      },
      act: (cubit) => cubit.filterByStatus(ApprovalStatus.approved, 'ws_1'),
      expect: () => [
        isA<TimeTrackerRequestsState>()
            .having(
              (state) => state.status,
              'status',
              TimeTrackerRequestsStatus.initial,
            )
            .having(
              (state) => state.selectedStatus,
              'selectedStatus',
              ApprovalStatus.approved,
            )
            .having((state) => state.workspaceId, 'workspaceId', isNull),
        isA<TimeTrackerRequestsState>()
            .having(
              (state) => state.status,
              'status',
              TimeTrackerRequestsStatus.loading,
            )
            .having(
              (state) => state.selectedStatus,
              'selectedStatus',
              ApprovalStatus.approved,
            )
            .having((state) => state.workspaceId, 'workspaceId', 'ws_1')
            .having((state) => state.requests, 'requests', isEmpty),
        isA<TimeTrackerRequestsState>()
            .having(
              (state) => state.status,
              'status',
              TimeTrackerRequestsStatus.loaded,
            )
            .having(
              (state) => state.selectedStatus,
              'selectedStatus',
              ApprovalStatus.approved,
            )
            .having((state) => state.workspaceId, 'workspaceId', 'ws_1')
            .having(
              (state) => state.requests,
              'requests',
              [_request('req_approved', ApprovalStatus.approved)],
            )
            .having((state) => state.lastUpdatedAt, 'lastUpdatedAt', isNotNull),
      ],
      verify: (_) {
        verify(
          () => repository.getRequests(
            'ws_1',
            status: 'approved',
            userId: any(named: 'userId'),
            limit: any(named: 'limit'),
            offset: any(named: 'offset'),
          ),
        ).called(1);
      },
    );

    test('keeps latest result when filter changes quickly', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);
      final pendingCompleter = Completer<List<TimeTrackingRequest>>();

      when(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer((_) => pendingCompleter.future);

      when(
        () => repository.getRequests(
          'ws_1',
          status: 'approved',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer(
        (_) async => [_request('req_approved', ApprovalStatus.approved)],
      );

      unawaited(cubit.filterByStatus(ApprovalStatus.pending, 'ws_1'));
      await Future<void>.delayed(Duration.zero);

      await cubit.filterByStatus(ApprovalStatus.approved, 'ws_1');
      pendingCompleter.complete([
        _request('req_pending', ApprovalStatus.pending),
      ]);
      await Future<void>.delayed(Duration.zero);

      expect(cubit.state.selectedStatus, ApprovalStatus.approved);
      expect(
        cubit.state.requests,
        [_request('req_approved', ApprovalStatus.approved)],
      );

      verify(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).called(1);
      verify(
        () => repository.getRequests(
          'ws_1',
          status: 'approved',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).called(1);

      await cubit.close();
    });

    test('persists status override for subsequent reloads', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests(
          'ws_1',
          status: 'approved',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer(
        (_) async => [_request('req_approved', ApprovalStatus.approved)],
      );

      await cubit.loadRequests('ws_1', statusOverride: 'approved');
      await cubit.loadRequests('ws_1');

      expect(cubit.state.selectedStatus, ApprovalStatus.approved);
      expect(cubit.state.isFromCache, true);
      verify(
        () => repository.getRequests(
          'ws_1',
          status: 'approved',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).called(1);

      await cubit.close();
    });

    test('persists all override as no status filter', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests(
          'ws_1',
          status: 'all',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer((_) async => [_request('req_all', ApprovalStatus.pending)]);

      await cubit.loadRequests('ws_1', statusOverride: 'all');
      await cubit.loadRequests('ws_1');

      expect(cubit.state.selectedStatus, isNull);
      expect(cubit.state.isFromCache, true);
      verify(
        () => repository.getRequests(
          'ws_1',
          status: 'all',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).called(1);

      await cubit.close();
    });

    test('approve invalidates cached request list before reload', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer((_) async => [_request('req_1', ApprovalStatus.pending)]);

      await cubit.loadRequests('ws_1', statusOverride: 'pending');

      when(
        () => repository.updateRequestStatus(
          'ws_1',
          'req_1',
          status: ApprovalStatus.approved,
        ),
      ).thenAnswer((_) async {});
      when(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer((_) async => const <TimeTrackingRequest>[]);

      await cubit.approveRequest('req_1', 'ws_1');

      expect(cubit.state.requests, isEmpty);
      verify(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).called(2);

      await cubit.close();
    });

    test('approve updates current list even if reload fails', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer((_) async => [_request('req_1', ApprovalStatus.pending)]);

      await cubit.loadRequests('ws_1', statusOverride: 'pending');

      when(
        () => repository.updateRequestStatus(
          'ws_1',
          'req_1',
          status: ApprovalStatus.approved,
        ),
      ).thenAnswer((_) async {});
      when(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenThrow(Exception('reload failed'));

      await cubit.approveRequest('req_1', 'ws_1');

      expect(cubit.state.requests, isEmpty);
      expect(cubit.state.status, TimeTrackerRequestsStatus.loaded);
      expect(cubit.state.error, contains('reload failed'));

      await cubit.close();
    });

    test('force refresh bypasses fresh cache and reloads repository', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer(
        (_) async => [_request('req_cached', ApprovalStatus.pending)],
      );

      await cubit.loadRequests('ws_1', statusOverride: 'pending');

      when(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer(
        (_) async => [_request('req_fresh', ApprovalStatus.pending)],
      );

      await cubit.loadRequests(
        'ws_1',
        statusOverride: 'pending',
        forceRefresh: true,
      );

      expect(
        cubit.state.requests,
        [_request('req_fresh', ApprovalStatus.pending)],
      );
      verify(
        () => repository.getRequests(
          'ws_1',
          status: 'pending',
          userId: any(named: 'userId'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).called(2);

      await cubit.close();
    });

    test(
      'updateRequest returns merged request preserving user enrichment',
      () async {
        const previous = TimeTrackingRequest(
          id: 'req_1',
          title: 'Old title',
          userDisplayName: 'Sam',
          userAvatarUrl: 'https://example.com/a.png',
        );
        const fresh = TimeTrackingRequest(
          id: 'req_1',
          title: 'New title',
        );

        final cubit = TimeTrackerRequestsCubit(
          repository: repository,
          initialState: const TimeTrackerRequestsState(
            status: TimeTrackerRequestsStatus.loaded,
            workspaceId: 'ws_1',
            requests: [previous],
          ),
        );
        final startTime = DateTime.utc(2026, 2, 24, 9);
        final endTime = DateTime.utc(2026, 2, 24, 10);

        when(
          () => repository.updateRequest(
            'ws_1',
            'req_1',
            'New title',
            startTime,
            endTime,
            description: any(named: 'description'),
            removedImages: any(named: 'removedImages'),
            newImageLocalPaths: any(named: 'newImageLocalPaths'),
          ),
        ).thenAnswer((_) async => fresh);

        final result = await cubit.updateRequest(
          'ws_1',
          'req_1',
          'New title',
          startTime,
          endTime,
        );

        expect(result, isNotNull);
        expect(result!.title, 'New title');
        expect(result.userDisplayName, 'Sam');
        expect(result.userAvatarUrl, 'https://example.com/a.png');
        expect(cubit.state.requests.single.userDisplayName, 'Sam');
        expect(
          cubit.state.requests.single.userAvatarUrl,
          'https://example.com/a.png',
        );

        await cubit.close();
      },
    );
  });
}

TimeTrackingRequest _request(String id, ApprovalStatus status) {
  return TimeTrackingRequest(
    id: id,
    approvalStatus: status,
    title: 'Request $id',
  );
}
