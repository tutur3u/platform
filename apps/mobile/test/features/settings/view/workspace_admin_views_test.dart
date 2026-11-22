import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/settings/view/settings_workspace_member_sheets.dart';
import 'package:mobile/features/settings/view/settings_workspace_members_view.dart';
import 'package:mobile/features/settings/view/settings_workspace_secrets_view.dart';
import 'package:mobile/features/settings/view/workspace_admin_widgets.dart';

import 'workspace_admin_fixtures.dart';

Widget _members({
  String query = '',
  ValueChanged<WorkspaceMemberListItem>? onOpen,
  ValueChanged<WorkspaceMemberListItem>? onRevoke,
  ValueChanged<WorkspaceInviteLink>? onCopy,
}) => AppPageListView(
  children: [
    WorkspaceMembersView(
      workspaceId: 'ws',
      loading: false,
      canManage: true,
      query: query,
      members: adminMembers,
      inviteLinks: adminInviteLinks,
      onRetry: () {},
      onOpenMember: onOpen ?? (_) {},
      onRevokeInvite: onRevoke ?? (_) {},
      onCopyLink: onCopy ?? (_) {},
      onDeleteLink: (_) {},
      onCreateLink: () {},
    ),
  ],
);

void main() {
  group('workspace admin helpers', () {
    test('initials come from names, emails and handles', () {
      expect(workspacePersonInitials('Linh Tran'), 'LT');
      expect(workspacePersonInitials('an.nguyen@example.com'), 'AN');
      expect(workspacePersonInitials('@vhpx'), 'V');
      expect(workspacePersonInitials(''), '?');
    });

    test('members sort the owner first and search roles', () {
      final sorted = filterWorkspaceMembers(adminMembers, '');
      expect(sorted.first.id, 'owner');
      expect(
        filterWorkspaceMembers(adminMembers, 'operations').map((m) => m.id),
        ['member-1'],
      );
      expect(filterWorkspaceMembers(adminMembers, 'nobody'), isEmpty);
    });

    test('secrets filter by name and value', () {
      expect(filterWorkspaceSecrets(adminSecrets, 'drive').map((s) => s.id), [
        's-2',
        's-4',
        's-3',
      ]);
      expect(filterWorkspaceSecrets(adminSecrets, 'sk-live'), hasLength(1));
    });
  });

  group('WorkspaceMembersView', () {
    testWidgets('lists members with role badges, invites and links', (
      tester,
    ) async {
      WorkspaceMemberListItem? opened;
      WorkspaceMemberListItem? revoked;
      await pumpAdminSurface(
        tester,
        _members(
          onOpen: (member) => opened = member,
          onRevoke: (member) => revoked = member,
        ),
      );

      expect(find.text('Linh Tran'), findsOneWidget);
      expect(find.text('Creator'), findsOneWidget);
      expect(find.text('Finance'), findsOneWidget);
      expect(find.text('+1'), findsOneWidget);
      expect(find.text('new.hire@example.com'), findsOneWidget);
      expect(find.text('Pending'), findsOneWidget);
      expect(find.text('TEAM-2026'), findsOneWidget);
      // A full link offers delete only, never copy.
      expect(find.byTooltip('Copy'), findsOneWidget);

      await tester.tap(find.text('Minh Pham'));
      expect(opened?.id, 'member-1');
      await tester.tap(find.byTooltip('Revoke invitation'));
      expect(revoked?.email, 'new.hire@example.com');
    });

    testWidgets('search hides links and shows an empty result', (tester) async {
      await pumpAdminSurface(tester, _members(query: 'zzz'));
      expect(find.text('TEAM-2026'), findsNothing);
      expect(find.byType(AppStateMessage), findsOneWidget);
    });
  });

  group('showAppAsyncConfirmDialog', () {
    testWidgets('keeps the dialog open with the error, then confirms', (
      tester,
    ) async {
      var attempts = 0;
      bool? result;
      await pumpAdminSurface(
        tester,
        Builder(
          builder: (context) => AppButton(
            onPressed: () async {
              result = await showAppAsyncConfirmDialog(
                context: context,
                title: 'Remove',
                message: 'Remove Minh?',
                confirmLabel: 'Remove',
                cancelLabel: 'Cancel',
                describeError: (error) =>
                    describeWorkspaceAdminError(context, error),
                onConfirm: () async {
                  attempts += 1;
                  if (attempts == 1) {
                    throw const ApiException(
                      message:
                          'At least one member must be able to manage members',
                      statusCode: 409,
                      code: 'WORKSPACE_LAST_MANAGER',
                    );
                  }
                },
              );
            },
            child: const Text('open'),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('app-async-confirm')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'At least one member must be able to manage members. '
          'Give another member that access first.',
        ),
        findsOneWidget,
      );
      expect(result, isNull);

      await tester.tap(find.byKey(const ValueKey('app-async-confirm')));
      await tester.pumpAndSettle();
      expect(attempts, 2);
      expect(result, isTrue);
      expect(find.text('Remove?'), findsNothing);
    });
  });

  group('WorkspaceMemberSheet', () {
    testWidgets('saves only changed role assignments', (tester) async {
      Set<String>? current;
      Set<String>? selected;
      await pumpAdminSurface(
        tester,
        WorkspaceMemberSheet(
          member: adminMembers[1],
          roles: adminRoles,
          canEditRoles: true,
          canRemove: true,
          onSaveRoles: (from, to) async {
            current = from;
            selected = to;
          },
        ),
      );
      final save = find.byKey(const ValueKey('workspace-member-save-roles'));
      expect(tester.widget<AppButton>(save).onPressed, isNull);

      await tester.tap(find.text('Admin'));
      await tester.tap(find.text('Sales'));
      await tester.pump();
      expect(tester.widget<AppButton>(save).onPressed, isNotNull);
      await tester.tap(save);
      await tester.pump();
      expect(current, {'r-finance', 'r-ops', 'r-sales'});
      expect(selected, {'r-finance', 'r-ops', 'r-admin'});
    });

    testWidgets('owners cannot be removed', (tester) async {
      await pumpAdminSurface(
        tester,
        WorkspaceMemberSheet(
          member: adminMembers.first,
          roles: adminRoles,
          canEditRoles: false,
          canRemove: false,
          onSaveRoles: (_, _) async {},
        ),
      );
      expect(
        find.byKey(const ValueKey('workspace-member-remove')),
        findsNothing,
      );
      expect(find.text('Creator'), findsOneWidget);
    });
  });

  group('WorkspaceSecretRow', () {
    testWidgets('masks values until revealed and copies on request', (
      tester,
    ) async {
      var copied = 0;
      await pumpAdminSurface(
        tester,
        AppGroupedCard(
          children: [
            WorkspaceSecretRow(
              secret: adminSecrets.first,
              onTap: () {},
              onCopy: () => copied += 1,
              onToggle: (_) {},
            ),
          ],
        ),
      );
      expect(find.text('sk-live-123'), findsNothing);
      expect(find.text(workspaceSecretMask), findsOneWidget);

      await tester.tap(
        find.byKey(const ValueKey('workspace-secret-reveal-s-1')),
      );
      await tester.pump();
      expect(find.text('sk-live-123'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('workspace-secret-copy-s-1')));
      expect(copied, 1);
    });

    testWidgets('boolean secrets toggle instead of revealing', (tester) async {
      bool? toggled;
      await pumpAdminSurface(
        tester,
        AppGroupedCard(
          children: [
            WorkspaceSecretRow(
              secret: adminSecrets[1],
              onTap: () {},
              onCopy: () {},
              onToggle: (value) => toggled = value,
            ),
          ],
        ),
      );
      expect(
        find.byKey(const ValueKey('workspace-secret-reveal-s-2')),
        findsNothing,
      );
      await tester.tap(find.byType(AppSwitch));
      expect(toggled, isTrue);
    });
  });

  testWidgets('secret view keeps rollout secrets masked when sensitive', (
    tester,
  ) async {
    await pumpAdminSurface(
      tester,
      AppPageListView(
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
    );
    expect(find.text('tuturuuu-drive'), findsWidgets);
    expect(
      find.byKey(
        const ValueKey(
          'workspace-secret-definition-DRIVE_R2_SECRET_ACCESS_KEY',
        ),
      ),
      findsOneWidget,
    );
    expect(find.text('Missing'), findsWidgets);
  });
}
