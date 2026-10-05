import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/view/habits_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Repository extends Mock implements IHabitTrackerRepository {}

void main() {
  setUpAll(() => registerFallbackValue(HabitTrackerScope.self));
  setUp(() async {
    HabitsCubit.clearCache();
    await CacheStore.instance.clearScope();
  });
  testWidgets(
    'account switch closes the previous habit detail and starts a clean host',
    (tester) async {
      final auth = _Auth();
      final workspace = _Workspace();
      final repository = _Repository();
      final stream = StreamController<AuthState>.broadcast();
      AuthState session(String id) => AuthState.authenticated(
        User(
          id: id,
          appMetadata: const {},
          userMetadata: const {},
          aud: 'authenticated',
          createdAt: '2026-03-25T00:00:00Z',
        ),
      );
      var current = session('owner-a');
      when(() => auth.state).thenAnswer((_) => current);
      when(() => auth.stream).thenAnswer((_) => stream.stream);
      when(() => workspace.state).thenReturn(
        const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'ws', name: 'Workspace'),
        ),
      );
      when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
      Map<String, dynamic> tracker(String actor) => {
        'id': actor,
        'ws_id': 'ws',
        'name': 'Private $actor',
      };
      HabitTrackerListResponse rows(String actor) =>
          HabitTrackerListResponse.fromJson({
            'trackers': [
              {'tracker': tracker(actor)},
            ],
          });
      final second = Completer<HabitTrackerListResponse>();
      when(
        () => repository.listTrackers(
          'ws',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer(
        (_) => current.user!.id == 'owner-a'
            ? Future.value(rows('owner-a'))
            : second.future,
      );
      when(
        () => repository.getTrackerDetail(
          'ws',
          any(),
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer(
        (call) async => HabitTrackerDetailResponse.fromJson({
          'tracker': tracker(call.positionalArguments[1] as String),
        }),
      );
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
            BlocProvider(create: (_) => ShellChromeActionsCubit()),
          ],
          child: HabitsPage(repository: repository),
        ),
      );
      Future<void> frames() async {
        for (var i = 0; i < 8; i++) {
          await tester.pump(const Duration(milliseconds: 60));
        }
      }

      await frames();
      expect(find.text('Private owner-a'), findsOneWidget);
      await tester.tap(find.text('Private owner-a'));
      await frames();
      current = session('owner-b');
      stream.add(current);
      await frames();
      expect(find.text('Private owner-a', skipOffstage: false), findsNothing);
      second.complete(rows('owner-b'));
      await frames();
      expect(find.text('Private owner-b'), findsOneWidget);
      expect(find.text('Private owner-a', skipOffstage: false), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await stream.close();
    },
  );
}
