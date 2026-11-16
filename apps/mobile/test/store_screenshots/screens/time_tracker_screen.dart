import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

import '../fixtures/time_tracker_fixture.dart';
import '../store_screenshot_app.dart';

/// The time tracker page over Linh's launch-week log: today's sessions and
/// the period overview, which fill every size; the running-timer section
/// alone leaves most of the screen empty.
Widget buildStoreTimeTracker(
  StoreLocale locale, {
  TimeTrackerSection section = TimeTrackerSection.history,
  HistoryViewMode historyViewMode = HistoryViewMode.day,
}) {
  final state = StoreTimeTrackerFixture.state(
    locale,
    historyViewMode: historyViewMode,
  );
  return MultiBlocProvider(
    providers: [
      BlocProvider<AuthCubit>.value(value: storeTimerAuthCubit()),
      BlocProvider<WorkspaceCubit>.value(value: storeTimerWorkspaceCubit()),
      BlocProvider<CalendarSettingsCubit>.value(
        value: storeCalendarSettingsCubit(),
      ),
      BlocProvider(create: (_) => ShellChromeActionsCubit()),
    ],
    child: TimeTrackerPage(
      initialSection: section,
      initialHistoryViewMode: historyViewMode,
      cubitFactory: (_) => storeTimeTrackerCubit(state),
    ),
  );
}

const StoreScreen timeTrackerStoreScreen = StoreScreen(
  id: 'time-tracker',
  order: 7,
  shellLocation: Routes.timer,
  build: buildStoreTimeTracker,
);
