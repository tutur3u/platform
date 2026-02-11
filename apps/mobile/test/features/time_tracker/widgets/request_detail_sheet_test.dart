import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_sheet.dart';

import '../../../helpers/helpers.dart';

void main() {
  group('RequestDetailSheet', () {
    final request = TimeTrackingRequest(
      id: 'req_1',
      title: 'Review my request',
      description: 'Need approval for this tracked session.',
      startTime: DateTime(2026, 2, 10, 9),
      endTime: DateTime(2026, 2, 10, 10, 30),
    );

    testWidgets('renders in draggable sheet with manager actions', (
      tester,
    ) async {
      await tester.pumpApp(
        Scaffold(
          body: RequestDetailSheet(
            request: request,
            wsId: 'test_ws_id',
            isManager: true,
            onApprove: () {},
            onReject: (_) {},
            onRequestInfo: (_) {},
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
            onApprove: () {},
            onReject: (_) {},
            onRequestInfo: (_) {},
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Approve'), findsNothing);
      expect(find.text('Reject'), findsNothing);
    });
  });
}
