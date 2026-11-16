import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../fixtures/calendar_fixture.dart';
import '../fixtures/store_team.dart';
import '../store_screenshot_app.dart';

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

WorkspaceCubit _workspace() {
  const workspace = Workspace(
    id: StoreTeam.workspaceId,
    name: StoreTeam.workspaceName,
  );
  final cubit = _Workspace();
  whenListen(
    cubit,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: [workspace],
      currentWorkspace: workspace,
    ),
  );
  return cubit;
}

/// The real calendar page: three days on phones, the full week on wider
/// layouts, filled with the team's launch-week schedule.
final StoreScreen calendarStoreScreen = StoreScreen(
  id: 'calendar',
  order: 3,
  shellLocation: Routes.calendar,
  build: (locale) {
    // Each capture starts from a cold calendar so no other locale leaks in.
    CalendarCubit.clearCache();
    return MultiBlocProvider(
      providers: [
        BlocProvider<WorkspaceCubit>(create: (_) => _workspace()),
        BlocProvider(create: (_) => CalendarSettingsCubit()),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
        BlocProvider(create: (_) => ShellMiniNavCubit()),
      ],
      child: CalendarPage(
        repositoryFactory: () => StoreCalendarRepository(locale),
        cacheStore: StoreEmptyCacheStore(),
      ),
    );
  },
  prepare: _scrollToWorkday,
);

/// The timeline opens at the current hour at the default zoom. Zoom so the
/// working day (8:30 to 18:00) fills the frame and start it at 8:30, whatever
/// time the capture runs.
Future<void> _scrollToWorkday(WidgetTester tester, StoreLocale locale) async {
  var position = _timelinePosition(tester);
  if (position == null) return;
  final cubit = tester
      .element(find.byType(MultiDayScheduleView))
      .read<CalendarCubit>();
  final hourHeight = _hourHeight(position);
  final baseHourHeight = hourHeight / cubit.state.timelineZoom;
  await cubit.setTimelineZoom(
    position.viewportDimension / (9.5 * baseHourHeight),
    expectedUserId: currentCacheUserId(),
    expectedWorkspaceId: StoreTeam.workspaceId,
    expectedScope: cubit.timelineZoomScope,
  );
  await settleStoreScreen(tester);
  position = _timelinePosition(tester);
  if (position == null) return;
  position.jumpTo(
    (_hourHeight(position) * 8.5).clamp(0, position.maxScrollExtent),
  );
  await tester.pump(const Duration(milliseconds: 400));
}

double _hourHeight(ScrollPosition position) =>
    (position.maxScrollExtent + position.viewportDimension) / 24;

/// The vertical hour grid: the tallest vertical scrollable in the timeline.
ScrollPosition? _timelinePosition(WidgetTester tester) {
  ScrollPosition? best;
  final scrollables = find.descendant(
    of: find.byType(MultiDayScheduleView),
    matching: find.byType(Scrollable),
  );
  for (final element in scrollables.evaluate()) {
    final state = (element as StatefulElement).state;
    if (state is! ScrollableState) continue;
    final position = state.position;
    if (position.axis != Axis.vertical || position.maxScrollExtent <= 0) {
      continue;
    }
    if (best == null || position.maxScrollExtent > best.maxScrollExtent) {
      best = position;
    }
  }
  return best;
}
