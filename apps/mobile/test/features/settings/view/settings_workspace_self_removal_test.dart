import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/settings_workspace_members_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import 'workspace_admin_fixtures.dart';

class _AuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _WorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _Members extends Mock implements WorkspaceManagementRepository {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

void main() {
  for (final (locale, refusal) in [
    (
      'en',
      'You are the only person who can manage members here. '
          'Give another member that access first.',
    ),
    (
      'vi',
      'Bạn là người duy nhất có quyền quản lý thành viên trong không gian '
          'làm việc này. Hãy cấp quyền đó cho một thành viên khác trước.',
    ),
  ]) {
    testWidgets('refuses the signed-in member’s departure in $locale', (
      tester,
    ) async {
      final auth = _AuthCubit();
      final workspace = _WorkspaceCubit();
      final members = _Members();
      final permissions = _Permissions();
      const authState = AuthState.authenticated(
        supa.User(
          id: 'member-1',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2026-11-22',
        ),
      );
      const workspaceState = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'ws', name: 'Team'),
      );
      when(() => auth.state).thenReturn(authState);
      whenListen(
        workspace,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );
      when(() => workspace.state).thenReturn(workspaceState);
      when(() => permissions.getPermissions(wsId: 'ws')).thenAnswer(
        (_) async => const WorkspacePermissions(
          permissions: {'manage_workspace_members'},
          isCreator: false,
        ),
      );
      when(
        () => members.getMembers('ws'),
      ).thenAnswer((_) async => adminMembers);
      when(() => members.getInviteLinks('ws')).thenAnswer((_) async => []);
      when(
        () => members.removeMember(wsId: 'ws', userId: 'member-1'),
      ).thenThrow(
        const ApiException(
          message: 'At least one member must be able to manage members',
          statusCode: 409,
          code: 'WORKSPACE_LAST_MANAGER',
        ),
      );

      await pumpAdminSurface(
        tester,
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
          ],
          child: SettingsWorkspaceMembersPage(
            repository: members,
            permissionsRepository: permissions,
          ),
        ),
        locale: locale,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Minh Pham'));
      await tester.pumpAndSettle();
      final remove = find.byKey(const ValueKey('workspace-member-remove'));
      await tester.ensureVisible(remove);
      await tester.tap(remove);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('app-async-confirm')));
      await tester.pumpAndSettle();

      expect(find.text(refusal), findsOneWidget);
      expect(find.byKey(const ValueKey('app-async-confirm')), findsOneWidget);
      verify(
        () => members.removeMember(wsId: 'ws', userId: 'member-1'),
      ).called(1);
      verify(() => members.getMembers('ws')).called(1);
    });
  }
}
