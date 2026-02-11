import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_state.dart';
import 'package:mocktail/mocktail.dart';

class _MockTimeTrackerRepository extends Mock
    implements TimeTrackerRepository {}

void main() {
  group('TimeTrackerRequestsCubit', () {
    late _MockTimeTrackerRepository repository;

    setUp(() {
      repository = _MockTimeTrackerRepository();
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
          selectedStatus: ApprovalStatus.approved,
        ),
        TimeTrackerRequestsState(
          status: TimeTrackerRequestsStatus.loaded,
          selectedStatus: ApprovalStatus.approved,
          requests: [_request('req_approved', ApprovalStatus.approved)],
        ),
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
  });
}

TimeTrackingRequest _request(String id, ApprovalStatus status) {
  return TimeTrackingRequest(
    id: id,
    approvalStatus: status,
    title: 'Request $id',
  );
}
