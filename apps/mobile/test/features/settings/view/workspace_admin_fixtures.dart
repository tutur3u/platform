import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/models/workspace_secret.dart';
import 'package:mobile/data/models/workspace_storage_rollout.dart';

import '../../../helpers/design_render_harness.dart';

/// Pumps [child] in the design render frame on a phone-sized view.
Future<void> pumpAdminSurface(
  WidgetTester tester,
  Widget child, {
  Brightness brightness = Brightness.light,
  String locale = 'en',
  Size size = const Size(390, 844),
}) async {
  DesignRender.setSize(tester, size);
  await tester.pumpWidget(
    DesignRenderApp(
      settings: DesignRender.themes['light']!.$1,
      brightness: brightness,
      child: Builder(
        builder: (context) => Localizations.override(
          context: context,
          locale: Locale(locale),
          child: child,
        ),
      ),
    ),
  );
  await tester.pump();
}

const adminMembers = [
  WorkspaceMemberListItem(
    id: 'owner',
    pending: false,
    isCreator: true,
    roles: [WorkspaceMemberRoleSummary(id: 'r-admin', name: 'Admin')],
    displayName: 'Linh Tran',
    email: 'linh@example.com',
  ),
  WorkspaceMemberListItem(
    id: 'member-1',
    pending: false,
    isCreator: false,
    roles: [
      WorkspaceMemberRoleSummary(id: 'r-finance', name: 'Finance'),
      WorkspaceMemberRoleSummary(id: 'r-ops', name: 'Operations'),
      WorkspaceMemberRoleSummary(id: 'r-sales', name: 'Sales'),
    ],
    displayName: 'Minh Pham',
    email: 'minh@example.com',
  ),
  WorkspaceMemberListItem(
    id: 'member-2',
    pending: false,
    isCreator: false,
    roles: [],
    email: 'an.nguyen@example.com',
  ),
  WorkspaceMemberListItem(
    id: 'invite-1',
    pending: true,
    isCreator: false,
    roles: [],
    email: 'new.hire@example.com',
  ),
];

const adminInviteLinks = [
  WorkspaceInviteLink(
    id: 'link-1',
    code: 'TEAM-2026',
    currentUses: 3,
    maxUses: 10,
    isExpired: false,
    isFull: false,
  ),
  WorkspaceInviteLink(
    id: 'link-2',
    code: 'OLD-LINK',
    currentUses: 5,
    maxUses: 5,
    isExpired: false,
    isFull: true,
  ),
];

const adminRoles = [
  WorkspaceRoleListItem(id: 'r-admin', name: 'Admin'),
  WorkspaceRoleListItem(id: 'r-finance', name: 'Finance'),
  WorkspaceRoleListItem(id: 'r-ops', name: 'Operations'),
  WorkspaceRoleListItem(id: 'r-sales', name: 'Sales'),
];

const adminSecrets = [
  WorkspaceSecret(id: 's-1', name: 'OPENAI_API_KEY', value: 'sk-live-123'),
  WorkspaceSecret(id: 's-2', name: 'DRIVE_AUTO_EXTRACT_ZIP', value: 'false'),
  WorkspaceSecret(id: 's-3', name: 'DRIVE_STORAGE_PROVIDER', value: 'r2'),
  WorkspaceSecret(id: 's-4', name: 'DRIVE_R2_BUCKET', value: 'tuturuuu-drive'),
];

final adminRollout = WorkspaceStorageRolloutState.fromJson(const {
  'activeProvider': 'r2',
  'backends': {
    'supabase': {
      'provider': 'supabase',
      'available': true,
      'selected': false,
      'overview': {'totalSize': 52428800, 'fileCount': 1240},
    },
    'r2': {
      'provider': 'r2',
      'available': true,
      'selected': true,
      'overview': {'totalSize': 73400320, 'fileCount': 1310},
    },
  },
  'autoExtract': {
    'enabled': false,
    'configured': false,
    'proxyUrlConfigured': false,
    'proxyTokenConfigured': false,
  },
});
