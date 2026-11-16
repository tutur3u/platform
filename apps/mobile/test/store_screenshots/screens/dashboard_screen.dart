import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../fixtures/shell_frame_fixture.dart';
import '../fixtures/store_team.dart';
import '../store_screenshot_app.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

class _Tasks extends MockCubit<TaskListState> implements TaskListCubit {}

class _Calendar extends MockCubit<CalendarState> implements CalendarCubit {}

/// Home: Linh's greeting, today's and upcoming tasks, the next events on the
/// studio calendar and today's counts for the launch week.
const dashboardStoreScreen = StoreScreen(
  id: 'dashboard',
  order: 1,
  build: _build,
);

const _studio = Workspace(
  id: StoreTeam.workspaceId,
  name: StoreTeam.workspaceName,
  tier: workspaceTierPro,
);

Workspace _personal(StoreLocale l) => Workspace(
  id: 'store-ws-personal',
  name: l.pick('Personal', 'Cá nhân'),
  personal: true,
);

TaskListInfo _list(StoreLocale l, String en, String vi) => TaskListInfo(
  id: 'store-list-$en',
  name: l.pick(en, vi),
  board: TaskBoardInfo(id: 'store-board-launch', name: StoreTeam.project(l)),
);

UserTask _task(
  StoreLocale l,
  String id,
  String en,
  String vi,
  DateTime due,
  TaskListInfo list,
) => UserTask(id: id, name: l.pick(en, vi), endDate: due, list: list);

TaskListState _taskState(StoreLocale l) {
  final design = _list(l, 'Design', 'Thiết kế');
  final review = _list(l, 'In review', 'Đang duyệt');
  final launch = _list(l, 'Launch', 'Ra mắt');
  return TaskListState(
    status: TaskListStatus.loaded,
    hasLoadedOnce: true,
    totalActiveTasks: 14,
    overdueTasks: [
      _task(
        l,
        'store-task-moodboard',
        'Send the moodboard to Chi for sign-off',
        'Gửi moodboard để Chi duyệt',
        StoreTeam.at(17, 0, -1),
        design,
      ),
    ],
    todayTasks: [
      _task(
        l,
        'store-task-illustrations',
        'Review onboarding illustrations',
        'Duyệt bộ minh hoạ màn hình chào mừng',
        StoreTeam.at(15),
        review,
      ),
      _task(
        l,
        'store-task-screenshots',
        'Finalize the launch page copy',
        'Chốt nội dung trang ra mắt',
        StoreTeam.at(18),
        launch,
      ),
    ],
    upcomingTasks: [
      _task(
        l,
        'store-task-social',
        'Prepare launch-day social posts',
        'Chuẩn bị bài đăng mạng xã hội ngày ra mắt',
        StoreTeam.at(10, 0, 1),
        launch,
      ),
      _task(
        l,
        'store-task-pricing',
        'QA pass on the pricing page',
        'Kiểm thử lại trang bảng giá',
        StoreTeam.at(16, 0, 2),
        review,
      ),
      _task(
        l,
        'store-task-studio',
        'Book the photo studio for product shots',
        'Đặt studio chụp ảnh sản phẩm',
        StoreTeam.at(11, 0, 4),
        design,
      ),
    ],
  );
}

CalendarState _calendarState(StoreLocale l) {
  CalendarEvent event(
    String id,
    String en,
    String vi,
    String noteEn,
    String noteVi,
    DateTime start,
  ) => CalendarEvent(
    id: id,
    title: l.pick(en, vi),
    description: l.pick(noteEn, noteVi),
    startAt: start,
    endAt: start.add(const Duration(hours: 1)),
    wsId: StoreTeam.workspaceId,
  );
  return CalendarState(
    status: CalendarStatus.loaded,
    hasLoadedOnce: true,
    events: [
      event(
        'store-event-review',
        'Design review: launch visuals',
        'Review thiết kế: hình ảnh ra mắt',
        'Studio room · Minh, An, Chi',
        'Phòng studio · Minh, An, Chi',
        StoreTeam.at(9, 30, 1),
      ),
      event(
        'store-event-rehearsal',
        'Launch rehearsal',
        'Tổng duyệt buổi ra mắt',
        'Walk through the demo end to end',
        'Chạy thử toàn bộ phần demo',
        StoreTeam.at(14, 0, 2),
      ),
      event(
        'store-event-press',
        'Press kit check-in with Bao',
        'Rà soát bộ tài liệu báo chí với Bảo',
        'Final logos, photos and quotes',
        'Logo, ảnh và trích dẫn bản cuối',
        StoreTeam.at(16, 30, 3),
      ),
    ],
  );
}

Widget _build(StoreLocale l) {
  // Home's mail, meeting, finance and notes previews fetch from the live
  // API on their own; the listing shows the cards fed by fixture cubits.
  SharedPreferences.setMockInitialValues({
    'home-widgets-hidden': ['mail', 'meet', 'finance', 'notes'],
  });
  final personal = _personal(l);
  final auth = _Auth();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.unauthenticated(),
  );
  final workspaces = _Workspaces();
  whenListen(
    workspaces,
    const Stream<WorkspaceState>.empty(),
    initialState: WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: _studio,
      workspaces: [_studio, personal],
    ),
  );
  when(workspaces.refreshHiddenWorkspaces).thenAnswer((_) async {});
  when(() => workspaces.hasAuthenticatedActor).thenReturn(false);
  final profile = _Profile();
  whenListen(
    profile,
    const Stream<ShellProfileState>.empty(),
    initialState: ShellProfileState(
      userId: StoreTeam.me.id,
      profile: UserProfile(
        id: StoreTeam.me.id,
        displayName: StoreTeam.me.firstName,
        fullName: StoreTeam.me.name,
      ),
    ),
  );
  final tasks = _Tasks();
  whenListen(
    tasks,
    const Stream<TaskListState>.empty(),
    initialState: _taskState(l),
  );
  final calendar = _Calendar();
  whenListen(
    calendar,
    const Stream<CalendarState>.empty(),
    initialState: _calendarState(l),
  );
  // Home is a root tab: the shell builds it, so the fixture page goes in
  // through homePageBuilder rather than as the routed child.
  return storeShellFrame(
    location: Routes.home,
    homePageBuilder: (replayToken) => MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspaces),
        BlocProvider<ShellProfileCubit>.value(value: profile),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
      ],
      child: DashboardPage(
        replayToken: replayToken,
        taskListCubit: tasks,
        calendarCubit: calendar,
      ),
    ),
    child: const SizedBox.shrink(),
  );
}
