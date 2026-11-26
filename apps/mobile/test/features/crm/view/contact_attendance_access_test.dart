import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/crm/view/contact_attendance_history.dart';
import 'package:mobile/features/crm/view/crm_page.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/pump_app.dart';

class _Permissions extends Mock implements WorkspacePermissionsRepository {
  _Permissions(this.allowed);
  final Set<String> allowed;
  @override
  Future<WorkspacePermissions> getPermissions({
    required String wsId,
    String? userId,
  }) async => WorkspacePermissions(permissions: allowed, isCreator: false);
}

class _Repository extends Mock implements CrmRepository {
  _Repository({required this.serverAllowsAttendance});
  final bool serverAllowsAttendance;

  @override
  Future<List<CrmGroupTag>> getGroupTags(
    String wsId, {
    int page = 1,
    int pageSize = 100,
  }) async => const [];

  @override
  Future<List<CrmGroup>> getGroups(
    String wsId, {
    List<String>? ids,
    int page = 1,
    int pageSize = 200,
  }) async => const [];

  @override
  Future<CrmUsersResult> getUsers(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
    List<String> includedGroups = const [],
    List<String> excludedGroups = const [],
    String status = 'active',
    String linkStatus = 'all',
    String requireAttention = 'all',
    String groupMembership = 'all',
    bool withPromotions = false,
  }) async => CrmUsersResult(
    users: const [CrmUser(id: 'learner', workspaceId: 'ws', fullName: 'Lan')],
    count: 1,
    permissions: CrmUserPermissions(
      hasPrivateInfo: false,
      hasPublicInfo: true,
      canCheckUserAttendance: serverAllowsAttendance,
    ),
  );
}

void main() {
  for (final (label, workspaceAllows, serverAllows, shown) in [
    ('with attendance access', true, true, true),
    ('without the workspace permission', false, true, false),
    ('when the directory withholds it', true, false, false),
  ]) {
    testWidgets('contact detail shows attendance history $label', (
      tester,
    ) async {
      // A phone window, so the directory uses the dock layout.
      tester.view
        ..physicalSize = const Size(390, 844)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpApp(
        CrmWorkspace(
          actorId: 'actor',
          workspaceId: 'ws',
          repository: _Repository(serverAllowsAttendance: serverAllows),
          permissionsRepository: _Permissions({
            'view_users_public_info',
            if (workspaceAllows) 'check_user_attendance',
          }),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Lan'));
      await tester.pumpAndSettle();
      expect(
        find.byType(ContactAttendanceHistory),
        shown ? findsOneWidget : findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
