import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/workspace_deletion_repository.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/features/settings/view/settings_workspace_member_sheets.dart';
import 'package:mobile/features/settings/view/settings_workspace_members_view.dart';
import 'package:mobile/features/settings/view/settings_workspace_roles_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_secrets_view.dart';
import 'package:mobile/features/settings/view/workspace_danger_zone_section.dart';
import 'package:mobile/features/settings/view/workspace_deletion_sheet.dart';
import 'package:mobile/features/settings/view/workspace_role_editor_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';
import 'workspace_admin_fixtures.dart';

class _Roles extends Mock implements WorkspaceManagementRepository {}

class _Deletion extends Mock implements WorkspaceDeletionRepository {}

/// Workspace admin surfaces in light and dark, written to
/// `DESIGN_RENDER_DIR/workspace-admin` for review when it is set.
void main() {
  setUpAll(DesignRender.loadFonts);

  final roles = _Roles();
  when(() => roles.getRole('ws', 'r-finance')).thenAnswer(
    (_) async => const WorkspaceRoleDetail(
      id: 'r-finance',
      name: 'Finance',
      permissions: [
        WorkspaceRolePermissionState(id: 'manage_finance', enabled: true),
        WorkspaceRolePermissionState(id: 'view_finance_stats', enabled: true),
        WorkspaceRolePermissionState(id: 'ai_chat', enabled: true),
      ],
    ),
  );
  when(
    () => roles.getRoleMembers('ws', 'r-finance'),
  ).thenAnswer((_) async => const [WorkspaceRoleMember(id: 'member-1')]);
  when(() => roles.getMembers('ws')).thenAnswer((_) async => adminMembers);
  final deletion = _Deletion();
  when(
    () => deletion.getStatus('ws'),
  ).thenAnswer((_) async => WorkspaceDeletionStatus.ready);

  final surfaces = <String, Widget Function()>{
    'members': () => AppPageListView(
      children: [
        WorkspaceMembersView(
          workspaceId: 'ws',
          loading: false,
          canManage: true,
          members: adminMembers,
          inviteLinks: adminInviteLinks,
          onRetry: () {},
          onOpenMember: (_) {},
          onRevokeInvite: (_) {},
          onCopyLink: (_) {},
          onDeleteLink: (_) {},
          onCreateLink: () {},
        ),
      ],
    ),
    'member-sheet': () => WorkspaceMemberSheet(
      member: adminMembers[1],
      roles: adminRoles,
      canEditRoles: true,
      canRemove: true,
      onSaveRoles: (_, _) async {},
    ),
    'roles': () => AppPageListView(
      children: [
        WorkspaceRolesView(
          workspaceId: 'ws',
          loading: false,
          canManage: true,
          defaultRole: const WorkspaceRoleDetail(
            id: 'default',
            name: 'DEFAULT',
            permissions: [
              WorkspaceRolePermissionState(id: 'ai_chat', enabled: true),
              WorkspaceRolePermissionState(id: 'view_drive', enabled: true),
            ],
          ),
          roles: adminRoles,
          onRetry: () {},
          onOpenDefault: () {},
          onOpenRole: (_) {},
        ),
      ],
    ),
    'role-editor': () => WorkspaceRoleEditorSheet(
      repository: roles,
      wsId: 'ws',
      roleId: 'r-finance',
    ),
    'secrets': () => AppPageListView(
      children: [
        WorkspaceSecretsView(
          workspaceId: 'root',
          secrets: adminSecrets,
          rolloutState: adminRollout,
          onEditDefinition: (_) {},
          onMigrate: (_, _) {},
          onOpenSecret: (_) {},
          onToggleBoolean: (_, _) {},
          onCopySecret: (_) {},
        ),
      ],
    ),
    'danger-zone': () => AppPageListView(
      children: [WorkspaceDangerZoneSection(onDelete: () {})],
    ),
    'delete-sheet': () => WorkspaceDeletionSheet(
      workspace: const Workspace(id: 'ws', name: 'Acme Studio'),
      repository: deletion,
    ),
  };

  for (final brightness in Brightness.values) {
    for (final locale in ['en', 'vi']) {
      for (final entry in surfaces.entries) {
        testWidgets('${entry.key} renders ${brightness.name} $locale', (
          tester,
        ) async {
          await pumpAdminSurface(
            tester,
            entry.value(),
            brightness: brightness,
            locale: locale,
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await DesignRender.capture(
            tester,
            'workspace-admin/${entry.key}-${brightness.name}-$locale',
            pixelRatio: 2,
          );
        });
      }
    }
  }
}
