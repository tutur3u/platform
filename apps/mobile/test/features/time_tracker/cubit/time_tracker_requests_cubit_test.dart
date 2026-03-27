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

    setUp(() {
      repository = _MockTimeTrackerRepository();
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
          () => repository.getRequests('ws_1', status: 'approved'),
        ).thenAnswer(
          (_) async => [_request('req_approved', ApprovalStatus.approved)],
        );

        return TimeTrackerRequestsCubit(repository: repository);
      },
      act: (cubit) => cubit.filterByStatus(ApprovalStatus.approved, 'ws_1'),
      expect: () => [
        const TimeTrackerRequestsState(selectedStatus: ApprovalStatus.approved),
        const TimeTrackerRequestsState(
          status: TimeTrackerRequestsStatus.loading,
          workspaceId: 'ws_1',
          selectedStatus: ApprovalStatus.approved,
        ),
        isA<TimeTrackerRequestsState>()
            .having(
              (state) => state.status,
              'status',
              TimeTrackerRequestsStatus.loaded,
            )
            .having((state) => state.workspaceId, 'workspaceId', 'ws_1')
            .having(
              (state) => state.selectedStatus,
              'selectedStatus',
              ApprovalStatus.approved,
            )
            .having(
              (state) => state.requests,
              'requests',
              [_request('req_approved', ApprovalStatus.approved)],
            )
            .having((state) => state.lastUpdatedAt, 'lastUpdatedAt', isNotNull),
      ],
      verify: (_) {
        verify(
          () => repository.getRequests('ws_1', status: 'approved'),
        ).called(1);
      },
    );

    test('keeps latest result when filter changes quickly', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);
      final pendingCompleter = Completer<List<TimeTrackingRequest>>();

      when(
        () => repository.getRequests('ws_1', status: 'pending'),
      ).thenAnswer((_) => pendingCompleter.future);

      when(
        () => repository.getRequests('ws_1', status: 'approved'),
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

      verify(() => repository.getRequests('ws_1', status: 'pending')).called(1);
      verify(
        () => repository.getRequests('ws_1', status: 'approved'),
      ).called(1);

      await cubit.close();
    });

    test('persists status override for subsequent reloads', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests('ws_1', status: 'approved'),
      ).thenAnswer(
        (_) async => [_request('req_approved', ApprovalStatus.approved)],
      );

      await cubit.loadRequests('ws_1', statusOverride: 'approved');
      await cubit.loadRequests('ws_1');

      expect(cubit.state.selectedStatus, ApprovalStatus.approved);
      verify(
        () => repository.getRequests('ws_1', status: 'approved'),
      ).called(1);

      await cubit.close();
    });

    test('persists all override as no status filter', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests('ws_1', status: 'all'),
      ).thenAnswer((_) async => [_request('req_all', ApprovalStatus.pending)]);

      await cubit.loadRequests('ws_1', statusOverride: 'all');
      await cubit.loadRequests('ws_1');

      expect(cubit.state.selectedStatus, isNull);
      verify(
        () => repository.getRequests('ws_1', status: 'all'),
      ).called(1);
      verifyNever(() => repository.getRequests('ws_1', status: null));

      await cubit.close();
    });

    test('approve invalidates cached request list before reload', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests('ws_1', status: 'pending'),
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
        () => repository.getRequests('ws_1', status: 'pending'),
      ).thenAnswer((_) async => const <TimeTrackingRequest>[]);

      await cubit.approveRequest('req_1', 'ws_1');

      expect(cubit.state.requests, isEmpty);
      verify(
        () => repository.getRequests('ws_1', status: 'pending'),
      ).called(2);

      await cubit.close();
    });

    test('approve updates current list even if reload fails', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests('ws_1', status: 'pending'),
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
        () => repository.getRequests('ws_1', status: 'pending'),
      ).thenThrow(Exception('reload failed'));

      await cubit.approveRequest('req_1', 'ws_1');

      expect(cubit.state.requests, isEmpty);
      expect(cubit.state.status, TimeTrackerRequestsStatus.error);

      await cubit.close();
    });

    test('force refresh bypasses fresh cache and reloads repository', () async {
      final cubit = TimeTrackerRequestsCubit(repository: repository);

      when(
        () => repository.getRequests('ws_1', status: 'pending'),
      ).thenAnswer(
        (_) async => [_request('req_cached', ApprovalStatus.pending)],
      );

      await cubit.loadRequests('ws_1', statusOverride: 'pending');

      when(
        () => repository.getRequests('ws_1', status: 'pending'),
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
      verify(() => repository.getRequests('ws_1', status: 'pending')).called(2);

      await cubit.close();
    });
  });
}

TimeTrackingRequest _request(String id, ApprovalStatus status) {
  return TimeTrackingRequest(
    id: id,
    approvalStatus: status,
    title: 'Request $id',
  );
}
