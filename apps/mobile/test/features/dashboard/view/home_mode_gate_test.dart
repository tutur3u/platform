import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/pump_app.dart';
import '../../audience_mode/audience_mode_fakes.dart';
import '../../classes/classes_today_fakes.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Tasks extends MockCubit<TaskListState> implements TaskListCubit {}

class _Calendar extends MockCubit<CalendarState> implements CalendarCubit {}

const _workspace = Workspace(id: 'ec', name: 'Easy Center');
const _cardTitle = 'All classes today';
const _editorLabel = "Today's classes";

/// Education gating through the real Home: the card's data never loads in
/// General mode, and without view_user_groups the card is absent from Home
/// and from the customization sheet.
void main() {
  setUpAll(() async {
    await CacheStore.instance.init();
  });

  Future<void> pumpHome(
    WidgetTester tester, {
    required AudienceModeCubit mode,
    required ClassesTodayRepository classes,
  }) async {
    // The finance preview needs live data; the editor still lists it.
    SharedPreferences.setMockInitialValues({
      'home-widgets-hidden': ['finance'],
    });
    final auth = _Auth();
    final workspaces = _Workspaces();
    final tasks = _Tasks();
    final calendar = _Calendar();
    final chrome = ShellChromeActionsCubit();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'u1',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ),
    );
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: _workspace,
        workspaces: [_workspace],
      ),
    );
    whenListen(
      tasks,
      const Stream<TaskListState>.empty(),
      initialState: const TaskListState(
        status: TaskListStatus.loaded,
        hasLoadedOnce: true,
      ),
    );
    whenListen(
      calendar,
      const Stream<CalendarState>.empty(),
      initialState: const CalendarState(
        status: CalendarStatus.loaded,
        hasLoadedOnce: true,
      ),
    );
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await auth.close();
      await workspaces.close();
      await tasks.close();
      await calendar.close();
      await chrome.close();
    });
    await tester.pumpThemedHome(
      DashboardPage(
        taskListCubit: tasks,
        calendarCubit: calendar,
        classesTodayRepository: classes,
      ),
      wrap: (app) => MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<AudienceModeCubit>.value(value: mode),
          BlocProvider.value(value: chrome),
        ],
        child: app,
      ),
    );
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Future<void> openCustomization(WidgetTester tester) async {
    final customize = tester
        .element(find.byType(DashboardPage))
        .read<ShellChromeActionsCubit>()
        .state
        .resolveForLocation(Routes.home)
        .firstWhere((action) => action.id == 'home-customize');
    customize.onPressed!();
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    // The editor is open: a shared widget is listed.
    expect(find.text('Finance'), findsWidgets);
  }

  Future<AudienceModeCubit> modeCubit({AudienceMode? account}) async {
    final cubit = AudienceModeCubit(
      repository: FakeAudienceModeRepository()..account = account,
      store: MemoryAudienceModeStore(),
    );
    addTearDown(cubit.close);
    await cubit.bind(userId: 'u1', wsId: 'ec');
    return cubit;
  }

  testWidgets('General mode never fetches classes or offers the card', (
    tester,
  ) async {
    final classes = FakeClassesTodayRepository();
    await pumpHome(tester, mode: await modeCubit(), classes: classes);
    expect(find.text(_cardTitle), findsNothing);
    expect(classes.fetches, isEmpty);
    await openCustomization(tester);
    expect(find.text(_editorLabel), findsNothing);
    expect(classes.fetches, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'Education without view_user_groups leaves the card out of Home and the '
    'customization sheet',
    (tester) async {
      final classes = FakeClassesTodayRepository(allowed: false);
      await pumpHome(
        tester,
        mode: await modeCubit(account: AudienceMode.education),
        classes: classes,
      );
      expect(classes.fetches, ['u1/ec/mine']);
      expect(find.text(_cardTitle), findsNothing);
      await openCustomization(tester);
      expect(find.text(_editorLabel), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('Education with access shows the card and lists it', (
    tester,
  ) async {
    final classes = FakeClassesTodayRepository(
      snapshot: ClassesTodaySnapshot(
        sessions: [
          session(
            'a',
            start: DateTime.now().add(const Duration(hours: 1)),
            groupName: 'IELTS A',
          ),
        ],
      ),
    );
    await pumpHome(
      tester,
      mode: await modeCubit(account: AudienceMode.education),
      classes: classes,
    );
    expect(find.text(_cardTitle), findsOneWidget);
    await openCustomization(tester);
    expect(find.text(_editorLabel), findsOneWidget);
    // Disposing Home closes the card cubit and its boundary timer.
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
