import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/view/contact_attendance_history.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';

class _Repository extends Mock implements CrmRepository {}

final _november = DateTime(2030, 11);
final _october = DateTime(2030, 10);

final _records = [
  CrmMemberAttendance(
    date: DateTime.utc(2030, 11, 3, 2),
    status: 'PRESENT',
    groupId: 'math',
    groupName: 'Math A1',
  ),
  CrmMemberAttendance(
    date: DateTime.utc(2030, 11, 5, 2),
    status: 'LATE',
    groupId: 'math',
    groupName: 'Math A1',
  ),
  CrmMemberAttendance(
    date: DateTime.utc(2030, 11, 7, 2),
    status: 'ABSENT',
    groupId: 'english',
    groupName: 'English B2',
  ),
];

Future<void> _pump(
  WidgetTester tester,
  _Repository repository, {
  String theme = 'light',
}) async {
  // A phone window, so the panel lays out as on the dock layout.
  DesignRender.setSize(tester, DesignRender.sizes['phone']!);
  await tester.runAsync(DesignRender.loadFonts);
  final (settings, brightness) = DesignRender.themes[theme]!;
  await tester.pumpWidget(
    DesignRenderApp(
      settings: settings,
      brightness: brightness,
      child: SingleChildScrollView(
        child: ContactAttendanceHistory(
          workspaceId: 'workspace',
          contactId: 'contact',
          repository: repository,
          now: () => DateTime(2030, 11, 20),
        ),
      ),
    ),
  );
}

Future<void> _open(WidgetTester tester) async {
  await tester.tap(find.text('Attendance'));
  await tester.pumpAndSettle();
}

void main() {
  for (final theme in ['light', 'dark']) {
    testWidgets('shows a month of attendance and moves between months in '
        '$theme', (tester) async {
      final repository = _Repository();
      when(
        () => repository.getMemberAttendance(
          'workspace',
          'contact',
          month: _november,
        ),
      ).thenAnswer((_) async => _records);
      when(
        () => repository.getMemberAttendance(
          'workspace',
          'contact',
          month: _october,
        ),
      ).thenAnswer((_) async => const []);
      await _pump(tester, repository, theme: theme);
      // Nothing loads until the panel opens.
      verifyZeroInteractions(repository);
      await _open(tester);

      expect(find.text('November 2030'), findsOneWidget);
      expect(find.text('Present 1'), findsOneWidget);
      expect(find.text('Late 1'), findsOneWidget);
      expect(find.text('Absent 1'), findsOneWidget);
      expect(find.text('Math A1'), findsNWidgets(2));
      expect(find.text('English B2'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'contacts-attendance-history-$theme');

      await tester.tap(find.byTooltip('Previous month'));
      await tester.pumpAndSettle();
      expect(find.text('October 2030'), findsOneWidget);
      expect(find.text('No attendance this month'), findsOneWidget);
      verify(
        () => repository.getMemberAttendance(
          'workspace',
          'contact',
          month: _october,
        ),
      ).called(1);

      await tester.tap(find.byTooltip('Next month'));
      await tester.pumpAndSettle();
      expect(find.text('November 2030'), findsOneWidget);
      expect(find.text('Present 1'), findsOneWidget);
    });
  }

  for (final status in [401, 403, 404]) {
    testWidgets('a $status response reports attendance as unavailable', (
      tester,
    ) async {
      final repository = _Repository();
      when(
        () => repository.getMemberAttendance(
          'workspace',
          'contact',
          month: _november,
        ),
      ).thenThrow(ApiException(message: 'Forbidden', statusCode: status));
      await _pump(tester, repository);
      await _open(tester);
      expect(find.text('Attendance access is unavailable'), findsOneWidget);
      expect(find.text('Retry'), findsNothing);
      expect(find.text('Present 1'), findsNothing);
    });
  }

  testWidgets('offline attendance says so and retries', (tester) async {
    final repository = _Repository();
    var calls = 0;
    when(
      () => repository.getMemberAttendance(
        'workspace',
        'contact',
        month: _november,
      ),
    ).thenAnswer((_) async {
      if (calls++ == 0) {
        throw const ApiException.transport(message: 'No connection');
      }
      return _records;
    });
    await _pump(tester, repository);
    await _open(tester);
    expect(find.text("Attendance isn't available offline"), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text("Attendance isn't available offline"), findsNothing);
    expect(find.text('Present 1'), findsOneWidget);
  });

  testWidgets('a server failure offers a retry', (tester) async {
    final repository = _Repository();
    when(
      () => repository.getMemberAttendance(
        'workspace',
        'contact',
        month: _november,
      ),
    ).thenThrow(const ApiException(message: 'Down', statusCode: 500));
    await _pump(tester, repository);
    await _open(tester);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('Attendance access is unavailable'), findsNothing);
  });

  test('the repository reads the month from the platform route', () async {
    final api = _Api();
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'attendance': [
          {
            'date': '2030-11-07T02:00:00.000Z',
            'status': 'absent',
            'session_id': 'session',
            'groups': {'id': 'english', 'name': 'English B2'},
          },
          {
            'date': '2030-11-03T02:00:00.000Z',
            'status': 'PRESENT',
            'groups': {'id': 'math', 'name': 'Math A1'},
          },
        ],
      },
    );
    final records = await CrmRepository(
      apiClient: api,
    ).getMemberAttendance('ws 1', 'contact', month: DateTime(2030, 3));
    verify(
      () => api.getJson(
        '/api/v1/workspaces/ws%201/users/contact/attendance?month=2030-03',
      ),
    ).called(1);
    // Oldest first, statuses normalised.
    expect(records.map((record) => record.groupName), [
      'Math A1',
      'English B2',
    ]);
    expect(records.last.status, 'ABSENT');
    expect(records.last.sessionId, 'session');
  });
}

class _Api extends Mock implements ApiClient {}
