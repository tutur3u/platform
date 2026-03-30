import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_settings.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_requests_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _MockTimeTrackerRepository extends Mock
    implements ITimeTrackerRepository {}

class _MockWorkspacePermissionsRepository extends Mock
    implements WorkspacePermissionsRepository {}

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

supa.User _user() => supa.User.fromJson({
  'id': 'user-1',
  'aud': 'authenticated',
  'role': 'authenticated',
  'email': 'user@example.com',
  'app_metadata': const <String, dynamic>{},
  'user_metadata': const <String, dynamic>{},
  'created_at': '2024-01-01T00:00:00.000000Z',
})!;

void main() {
  group('TimeTrackerRequestsPage', () {
    late _MockTimeTrackerRepository repository;
    late _MockWorkspacePermissionsRepository permissionsRepository;
    late _MockAuthCubit authCubit;
    late _MockWorkspaceCubit workspaceCubit;

    setUp(() {
      repository = _MockTimeTrackerRepository();
      permissionsRepository = _MockWorkspacePermissionsRepository();
      authCubit = _MockAuthCubit();
      workspaceCubit = _MockWorkspaceCubit();

      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: AuthState.authenticated(_user()),
      );
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'ws-1'),
        ),
      );

      when(
        () => repository.getRequests(
          'ws-1',
          status: 'pending',
          userId: 'user-1',
        ),
      ).thenAnswer((_) async => const []);
      when(
        () => repository.getWorkspaceSettings('ws-1'),
      ).thenAnswer(
        (_) async => const WorkspaceSettings(missedEntryDateThreshold: 0),
      );
      when(
        () => repository.getCategories('ws-1'),
      ).thenAnswer((_) async => const <TimeTrackingCategory>[]);
      when(
        () => permissionsRepository.getPermissions(
          wsId: 'ws-1',
          userId: 'user-1',
        ),
      ).thenAnswer(
        (_) async => const WorkspacePermissions(
          permissions: <String>{},
          isCreator: false,
        ),
      );
    });

    testWidgets(
      'loads the missed-entry threshold for non-managers',
      (tester) async {
        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: authCubit),
              BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            ],
            child: TimeTrackerRequestsPage(
              repository: repository,
              workspacePermissionsRepository: permissionsRepository,
            ),
          ),
        );
        await tester.pumpAndSettle();

        verify(() => repository.getWorkspaceSettings('ws-1')).called(1);
      },
    );
  });
}
