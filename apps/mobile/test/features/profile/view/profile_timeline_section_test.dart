import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_section.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Repository extends ProfileTimelineRepository {
  @override
  Future<List<ProfileTimelineItem>?> cached(
    String workspaceId,
    String userId,
  ) async => null;
  @override
  Future<({List<ProfileTimelineItem> items, bool partial})> refresh(
    String workspaceId,
    String userId,
  ) async => (
    items: [
      ProfileTimelineItem(
        id: 'early',
        type: 'task',
        createdAt: DateTime(2026, 9, 30, 8),
        scope: 'personal',
        title: 'Earlier task',
      ),
      ProfileTimelineItem(
        id: 'late',
        type: 'calendar',
        createdAt: DateTime(2026, 9, 30, 17),
        scope: 'workspace',
        title: 'Later event',
      ),
    ],
    partial: false,
  );
}

void main() {
  testWidgets(
    'real timeline entries display newest first without collapsed days',
    (tester) async {
      final auth = _Auth();
      final workspace = _Workspace();
      whenListen(
        auth,
        const Stream<AuthState>.empty(),
        initialState: const AuthState.authenticated(
          supa.User(
            id: 'owner',
            appMetadata: {},
            userMetadata: {},
            aud: 'authenticated',
            createdAt: '',
          ),
        ),
      );
      whenListen(
        workspace,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          currentWorkspace: Workspace(id: 'team', name: 'Team'),
        ),
      );
      addTearDown(auth.close);
      addTearDown(workspace.close);
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
          ],
          child: SingleChildScrollView(
            child: ProfileTimelineSection(
              replayToken: 0,
              repository: _Repository(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Later event'), findsOneWidget);
      expect(find.text('Earlier task'), findsOneWidget);
      expect(find.textContaining('workspace event'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Later event')).dy,
        lessThan(tester.getTopLeft(find.text('Earlier task')).dy),
      );
      expect(find.byType(ExpansionTile), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
