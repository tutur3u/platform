import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/time_tracking/request_comment.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockTimeTrackerRepository extends Mock
    implements ITimeTrackerRepository {}

void main() {
  group('RequestDetailSheet', () {
    late _MockTimeTrackerRepository repository;

    final request = TimeTrackingRequest(
      id: 'req_1',
      title: 'Review my request',
      description: 'Need approval for this tracked session.',
      startTime: DateTime(2026, 2, 10, 9),
      endTime: DateTime(2026, 2, 10, 10, 30),
    );

    setUp(() {
      repository = _MockTimeTrackerRepository();
      when(
        () => repository.getRequestComments(any(), any()),
      ).thenAnswer((_) async => const <TimeTrackingRequestComment>[]);
    });

    testWidgets('renders in draggable sheet with manager actions', (
      tester,
    ) async {
      await tester.pumpApp(
        Scaffold(
          body: RequestDetailSheet(
            request: request,
            wsId: 'test_ws_id',
            repository: repository,
            isManager: true,
            onApprove: () async {},
            onReject: (_) async {},
            onRequestInfo: (_) async {},
            onResubmit: () async {},
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(DraggableScrollableSheet), findsOneWidget);
      expect(find.text('Review my request'), findsOneWidget);
      expect(
        find.text('Need approval for this tracked session.'),
        findsOneWidget,
      );
      expect(find.text('Duration'), findsOneWidget);
      expect(find.text('Approve'), findsOneWidget);
      expect(find.text('Reject'), findsOneWidget);
    });

    testWidgets('hides manager actions for non-manager', (tester) async {
      await tester.pumpApp(
        Scaffold(
          body: RequestDetailSheet(
            request: request,
            wsId: 'test_ws_id',
            repository: repository,
            onApprove: () async {},
            onReject: (_) async {},
            onRequestInfo: (_) async {},
            onResubmit: () async {},
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Approve'), findsNothing);
      expect(find.text('Reject'), findsNothing);
    });

    testWidgets('updates request details immediately after reject action', (
      tester,
    ) async {
      String? submittedReason;

      await tester.pumpApp(
        Scaffold(
          body: RequestDetailSheet(
            request: request,
            wsId: 'test_ws_id',
            repository: repository,
            isManager: true,
            onApprove: () async {},
            onReject: (reason) async {
              submittedReason = reason;
            },
            onRequestInfo: (_) async {},
            onResubmit: () async {},
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Reject').first);
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(EditableText), 'Need more details');
      await tester.tap(find.text('Reject').last);
      await tester.pumpAndSettle();

      expect(submittedReason, 'Need more details');
      expect(find.text('Need more details'), findsOneWidget);
      expect(find.text('Rejected'), findsOneWidget);
      expect(find.text('Approve'), findsNothing);

      await tester.pump(const Duration(seconds: 6));
      await tester.pumpAndSettle();
    });

    testWidgets('expires revert actions while sheet remains open', (
      tester,
    ) async {
      final approvedRequest = TimeTrackingRequest(
        id: 'req_approved',
        userId: 'requester_1',
        title: 'Already approved request',
        approvalStatus: ApprovalStatus.approved,
        approvedAt: DateTime.now().toUtc().subtract(
          const Duration(seconds: 55),
        ),
      );

      await tester.pumpApp(
        Scaffold(
          body: RequestDetailSheet(
            request: approvedRequest,
            wsId: 'test_ws_id',
            repository: repository,
            isManager: true,
            statusChangeGracePeriodMinutes: 1,
            onApprove: () async {},
            onReject: (_) async {},
            onRequestInfo: (_) async {},
            onResubmit: () async {},
          ),
        ),
      );
      await tester.pump();

      expect(find.textContaining('Revert'), findsOneWidget);

      await tester.pump(const Duration(seconds: 6));
      await tester.pumpAndSettle();

      expect(find.textContaining('Revert'), findsNothing);
    });

    testWidgets(
      'uses current manager display name on optimistic status update',
      (
        tester,
      ) async {
        await tester.pumpApp(
          Scaffold(
            body: RequestDetailSheet(
              request: request,
              wsId: 'test_ws_id',
              repository: repository,
              isManager: true,
              currentUserId: 'manager_1',
              currentUserDisplayName: 'Manager Jane',
              onApprove: () async {},
              onReject: (_) async {},
              onRequestInfo: (_) async {},
              onResubmit: () async {},
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Reject').first);
        await tester.pumpAndSettle();

        await tester.enterText(find.byType(EditableText), 'Missing details');
        await tester.tap(find.text('Reject').last);
        await tester.pumpAndSettle();

        expect(find.textContaining('Manager Jane'), findsOneWidget);

        await tester.pump(const Duration(seconds: 6));
        await tester.pumpAndSettle();
      },
    );

    testWidgets(
      'shows feedback and allows owner to resubmit needs-info request',
      (
        tester,
      ) async {
        var didResubmit = false;

        final needsInfoRequest = TimeTrackingRequest(
          id: 'req_2',
          userId: 'user_1',
          title: 'Fix this request',
          startTime: DateTime(2026, 2, 10, 9),
          endTime: DateTime(2026, 2, 10, 10, 30),
          approvalStatus: ApprovalStatus.needsInfo,
          needsInfoReason: 'Please provide more context.',
        );

        await tester.pumpApp(
          Scaffold(
            body: RequestDetailSheet(
              request: needsInfoRequest,
              wsId: 'test_ws_id',
              repository: repository,
              currentUserId: 'user_1',
              onApprove: () async {},
              onReject: (_) async {},
              onRequestInfo: (_) async {},
              onResubmit: () async {
                didResubmit = true;
              },
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Please provide more context.'), findsOneWidget);
        expect(find.text('Resubmit request'), findsOneWidget);

        await tester.tap(find.text('Resubmit request'));
        await tester.pumpAndSettle();

        expect(didResubmit, isTrue);
        expect(find.text('Pending'), findsOneWidget);
        expect(find.text('Resubmit request'), findsNothing);
      },
    );
  });
}
