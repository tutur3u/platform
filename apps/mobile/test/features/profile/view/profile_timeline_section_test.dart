import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_days.dart';
import 'package:mobile/features/profile/view/profile_timeline_section.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
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
  Future<({List<ProfileTimelineItem> items, bool partial, bool limited})>
  refresh(String workspaceId, String userId) async => (
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
    limited: false,
  );
}

void main() {
  test('day grouping orders snapshots without mutating source data', () {
    final source = [
      ProfileTimelineItem(
        id: 'early',
        type: 'task',
        createdAt: DateTime(2026, 9, 29, 9),
        scope: 'personal',
      ),
      ProfileTimelineItem(
        id: 'late',
        type: 'note',
        createdAt: DateTime(2026, 9, 30, 17),
        scope: 'personal',
      ),
      ProfileTimelineItem(
        id: 'morning',
        type: 'calendar',
        createdAt: DateTime(2026, 9, 30, 8),
        scope: 'workspace',
      ),
    ];
    final groups = groupProfileTimelineDays(source);
    expect(groups.keys, [DateTime(2026, 9, 30), DateTime(2026, 9, 29)]);
    expect(groups.values.first.map((item) => item.id), ['late', 'morning']);
    expect(source.first.id, 'early');
  });

  testWidgets(
    'timeline localizes creation labels and keeps unknown records inert',
    (tester) async {
      await tester.pumpApp(
        Builder(
          builder: (context) => Localizations.override(
            context: context,
            locale: const Locale('vi'),
            child: ProfileTimelineDays(
              items: [
                ProfileTimelineItem(
                  id: 'calendar',
                  type: 'calendar',
                  createdAt: DateTime(2026, 9, 30, 8),
                  scope: 'workspace',
                  title: 'Team event',
                ),
                ProfileTimelineItem(
                  id: 'unknown',
                  type: 'future-source',
                  createdAt: DateTime(2026, 9, 29, 8),
                  scope: 'personal',
                ),
              ],
              onOpen: (_) => fail('Unknown records must not navigate'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('sự kiện'), findsWidgets);
      final rows = tester
          .widgetList<SettingsTile>(find.byType(SettingsTile))
          .toList();
      expect(rows.last.onTap, isNull);
      expect(tester.takeException(), isNull);
    },
  );
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
      expect(find.textContaining('workspace event'), findsNWidgets(2));
      expect(
        tester.getTopLeft(find.text('Later event')).dy,
        lessThan(tester.getTopLeft(find.text('Earlier task')).dy),
      );
      expect(find.byType(ExpansionTile), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
