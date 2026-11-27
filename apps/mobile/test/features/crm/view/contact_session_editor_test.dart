import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/crm/view/contact_attendance_sheet.dart';
import 'package:mobile/features/crm/view/contact_session_editor.dart';
import 'package:mobile/features/crm/view/crm_page.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/pump_app.dart';

void main() {
  CrmSession recurringSession(String end) => CrmSession(
    id: 'fb876acd-d1c1-4000-9331-133c83fdbe23',
    groupId: 'group',
    seriesId: 'series',
    title: 'Morning class',
    startsAt: '2026-11-27T09:00:42Z',
    endsAt: end,
    startTimezone: 'Asia/Tokyo',
    endTimezone: 'Asia/Ho_Chi_Minh',
  );

  testWidgets('labels the recurring scope and retains instants on title edit', (
    tester,
  ) async {
    (String, DateTime, DateTime)? saved;
    await tester.pumpThemedHome(
      ContactSessionEditor(
        session: recurringSession('2026-11-27T10:00:42Z'),
        onSave: (title, start, end) async {
          saved = (title, start.toUtc(), end.toUtc());
        },
      ),
    );

    expect(find.text('This occurrence only'), findsOneWidget);
    expect(find.text('Asia/Tokyo'), findsOneWidget);
    expect(find.text('Asia/Ho_Chi_Minh'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'New title');
    final save = find.text('Save');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(saved, (
      'New title',
      DateTime.utc(2026, 11, 27, 9, 0, 42),
      DateTime.utc(2026, 11, 27, 10, 0, 42),
    ));
  });

  testWidgets('keeps the editor open for an invalid chronological range', (
    tester,
  ) async {
    await tester.pumpThemedHome(
      ContactSessionEditor(
        session: recurringSession('2026-11-27T09:00:42Z'),
        onSave: (_, _, _) async => fail('Invalid range must not submit'),
      ),
    );
    final save = find.text('Save');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(find.text('End time must be after start time.'), findsOneWidget);
    expect(find.byType(ContactSessionEditor), findsOneWidget);
  });

  for (final canUpdate in [false, true]) {
    testWidgets(
      'Schedule keeps attendance tap with update permission $canUpdate',
      (tester) async {
        const channel = MethodChannel('dev.fluttercommunity.plus/connectivity');
        final messenger = tester.binding.defaultBinaryMessenger;
        addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          channel,
          (_) async => ['wifi'],
        );
        final repository = _ScheduleRepository();
        final permissions = _SchedulePermissions();
        final session = recurringSession('2026-11-27T10:00:42Z');
        when(() => permissions.getPermissions(wsId: 'ws')).thenAnswer(
          (_) async => WorkspacePermissions(
            permissions: {
              'view_users_public_info',
              'view_user_groups',
              if (canUpdate) 'update_user_groups',
            },
            isCreator: false,
          ),
        );
        when(
          () => repository.getUsers(
            'ws',
            query: any(named: 'query'),
            page: any(named: 'page'),
            status: any(named: 'status'),
            linkStatus: any(named: 'linkStatus'),
            requireAttention: any(named: 'requireAttention'),
            includedGroups: any(named: 'includedGroups'),
            excludedGroups: any(named: 'excludedGroups'),
          ),
        ).thenAnswer((_) async => const CrmUsersResult(users: [], count: 0));
        when(
          () => repository.getSessions(
            'ws',
            from: any(named: 'from'),
            to: any(named: 'to'),
          ),
        ).thenAnswer(
          (_) async => [
            session,
            const CrmSession(
              id: 'projected:2026-11-27',
              groupId: 'group',
              title: 'Preview',
              startsAt: '2026-11-27T11:00:00Z',
              endsAt: '2026-11-27T12:00:00Z',
            ),
          ],
        );
        when(
          () => repository.getGroupMembers('ws', 'group'),
        ).thenAnswer((_) async => []);
        when(
          () => repository.getAttendance(
            'ws',
            'group',
            date: any(named: 'date'),
            sessionId: session.id,
          ),
        ).thenAnswer((_) async => []);

        await tester.pumpApp(
          CrmWorkspace(
            actorId: 'actor',
            workspaceId: 'ws',
            repository: repository,
            permissionsRepository: permissions,
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Schedule'));
        await tester.pumpAndSettle();
        final edit = find.byTooltip('Edit session');
        expect(edit, canUpdate ? findsOneWidget : findsNothing);
        if (canUpdate) {
          await tester.tap(edit);
          await tester.pumpAndSettle();
          expect(find.byType(ContactSessionEditor), findsOneWidget);
          expect(find.byType(ContactAttendanceSheet), findsNothing);
          Navigator.of(tester.element(find.byType(ContactSessionEditor))).pop();
          await tester.pumpAndSettle();
        }

        await tester.tap(find.text('Morning class'));
        await tester.pumpAndSettle();
        expect(find.byType(ContactAttendanceSheet), findsOneWidget);
        expect(find.byType(ContactSessionEditor), findsNothing);
      },
    );
  }
}

class _ScheduleRepository extends Mock implements CrmRepository {}

class _SchedulePermissions extends Mock
    implements WorkspacePermissionsRepository {}
