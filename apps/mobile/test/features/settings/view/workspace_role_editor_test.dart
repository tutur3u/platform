import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/features/settings/view/workspace_role_editor_sheet.dart';
import 'package:mobile/features/settings/view/workspace_role_permission_catalog.dart';
import 'package:mocktail/mocktail.dart';

import 'workspace_admin_fixtures.dart';

class _Repository extends Mock implements WorkspaceManagementRepository {}

void main() {
  late _Repository repository;

  setUp(() {
    repository = _Repository();
    when(() => repository.getRole('ws', 'r-finance')).thenAnswer(
      (_) async => const WorkspaceRoleDetail(
        id: 'r-finance',
        name: 'Finance',
        permissions: [
          WorkspaceRolePermissionState(id: 'manage_finance', enabled: true),
        ],
      ),
    );
    when(
      () => repository.getRoleMembers('ws', 'r-finance'),
    ).thenAnswer((_) async => const [WorkspaceRoleMember(id: 'member-1')]);
    when(
      () => repository.getMembers('ws'),
    ).thenAnswer((_) async => adminMembers);
    when(
      () => repository.updateRole(
        wsId: any(named: 'wsId'),
        roleId: any(named: 'roleId'),
        name: any(named: 'name'),
        permissions: any(named: 'permissions'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => repository.replaceRoleMembers(
        wsId: any(named: 'wsId'),
        roleId: any(named: 'roleId'),
        currentMemberIds: any(named: 'currentMemberIds'),
        selectedMemberIds: any(named: 'selectedMemberIds'),
      ),
    ).thenAnswer((_) async {});
  });

  Future<void> pumpEditor(WidgetTester tester) async {
    await pumpAdminSurface(
      tester,
      WorkspaceRoleEditorSheet(
        repository: repository,
        wsId: 'ws',
        roleId: 'r-finance',
      ),
      size: const Size(390, 4000),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('select all fills a permission group and saves the matrix', (
    tester,
  ) async {
    await pumpEditor(tester);
    expect(find.text('1 permissions enabled'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('workspace-role-group-ai')));
    await tester.pump();
    expect(find.text('3 permissions enabled'), findsOneWidget);
    expect(find.text('Clear all'), findsOneWidget);

    final member = find.byKey(const ValueKey('workspace-role-member-member-2'));
    await tester.ensureVisible(member);
    await tester.pumpAndSettle();
    await tester.tap(member);
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('workspace-role-save')));
    await tester.pumpAndSettle();

    final saved =
        verify(
              () => repository.updateRole(
                wsId: 'ws',
                roleId: 'r-finance',
                name: 'Finance',
                permissions: captureAny(named: 'permissions'),
              ),
            ).captured.single
            as Map<String, bool>;
    expect(saved['ai_chat'], isTrue);
    expect(saved['ai_lab'], isTrue);
    expect(saved['manage_finance'], isTrue);
    expect(saved['admin'], isFalse);
    expect(
      saved.length,
      workspacePermissionCatalog.expand((g) => g.permissions).length,
    );
    verify(
      () => repository.replaceRoleMembers(
        wsId: 'ws',
        roleId: 'r-finance',
        currentMemberIds: {'member-1'},
        selectedMemberIds: {'member-1', 'member-2'},
      ),
    ).called(1);
  });

  testWidgets('admin shows that it grants every permission', (tester) async {
    await pumpEditor(tester);
    expect(
      find.text('Administrators have every permission in this workspace.'),
      findsNothing,
    );
    await tester.tap(
      find.byKey(const ValueKey('workspace-role-permission-admin')),
    );
    await tester.pump();
    expect(
      find.text('Administrators have every permission in this workspace.'),
      findsOneWidget,
    );
  });

  testWidgets('a blank name blocks saving', (tester) async {
    await pumpEditor(tester);
    await tester.enterText(
      find.byKey(const ValueKey('workspace-role-name')),
      '  ',
    );
    await tester.tap(find.byKey(const ValueKey('workspace-role-save')));
    await tester.pump();
    verifyNever(
      () => repository.updateRole(
        wsId: any(named: 'wsId'),
        roleId: any(named: 'roleId'),
        name: any(named: 'name'),
        permissions: any(named: 'permissions'),
      ),
    );
  });
}
