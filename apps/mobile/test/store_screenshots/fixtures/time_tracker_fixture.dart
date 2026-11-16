import 'package:bloc_test/bloc_test.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/period_stats.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../store_screenshot_app.dart';
import 'store_team.dart';

class StoreTimeTrackerCubit extends MockCubit<TimeTrackerState>
    implements TimeTrackerCubit {}

class StoreTimerAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class StoreTimerWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class StoreCalendarSettingsCubit extends MockCubit<CalendarSettingsState>
    implements CalendarSettingsCubit {}

/// Linh's launch-week time log.
abstract final class StoreTimeTrackerFixture {
  static List<TimeTrackingCategory> categories(StoreLocale l) => [
    TimeTrackingCategory(
      id: 'store-cat-design',
      name: l.pick('Design', 'Thiết kế'),
      color: 'PINK',
    ),
    TimeTrackingCategory(
      id: 'store-cat-build',
      name: l.pick('Development', 'Lập trình'),
      color: 'BLUE',
    ),
    TimeTrackingCategory(
      id: 'store-cat-meet',
      name: l.pick('Meetings', 'Họp'),
      color: 'ORANGE',
    ),
    TimeTrackingCategory(
      id: 'store-cat-write',
      name: l.pick('Writing', 'Viết'),
      color: 'PURPLE',
    ),
  ];

  static TimeTrackingSession _session(
    StoreLocale l, {
    required String id,
    required String title,
    required String categoryId,
    required DateTime start,
    required int minutes,
    String? description,
  }) {
    final category = categories(l).firstWhere((c) => c.id == categoryId);
    final end = start.add(Duration(minutes: minutes));
    return TimeTrackingSession(
      id: id,
      title: title,
      description: description,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      startTime: start,
      endTime: end,
      durationSeconds: minutes * 60,
      wsId: StoreTeam.workspaceId,
      userId: StoreTeam.me.id,
      createdAt: start,
    );
  }

  /// The focus session running right now.
  static TimeTrackingSession running(StoreLocale l) => TimeTrackingSession(
    id: 'store-session-running',
    title: l.pick(
      'Build the launch landing page',
      'Dựng trang giới thiệu ra mắt',
    ),
    description: l.pick(
      'Hero section, pricing table and signup form',
      'Phần ảnh bìa, bảng giá và biểu mẫu đăng ký',
    ),
    categoryId: 'store-cat-build',
    categoryName: l.pick('Development', 'Lập trình'),
    categoryColor: 'BLUE',
    startTime: DateTime.now().subtract(const Duration(minutes: 47)),
    isRunningFlag: true,
    wsId: StoreTeam.workspaceId,
    userId: StoreTeam.me.id,
  );

  /// Today's finished sessions, newest first.
  static List<TimeTrackingSession> today(StoreLocale l) => [
    _session(
      l,
      id: 'store-session-handoff',
      title: l.pick('Landing page handoff', 'Bàn giao trang giới thiệu'),
      categoryId: 'store-cat-build',
      start: StoreTeam.at(14, 30),
      minutes: 50,
    ),
    _session(
      l,
      id: 'store-session-review',
      title: l.pick('Design review with An', 'Duyệt thiết kế cùng An'),
      categoryId: 'store-cat-meet',
      start: StoreTeam.at(13, 30),
      minutes: 45,
    ),
    _session(
      l,
      id: 'store-session-hero',
      title: l.pick('Hero illustrations', 'Minh họa ảnh bìa'),
      categoryId: 'store-cat-design',
      start: StoreTeam.at(10, 40),
      minutes: 110,
    ),
    _session(
      l,
      id: 'store-session-standup',
      title: l.pick('Launch stand-up', 'Họp nhanh buổi sáng'),
      categoryId: 'store-cat-meet',
      start: StoreTeam.at(10),
      minutes: 25,
    ),
    _session(
      l,
      id: 'store-session-copy',
      title: l.pick('Pricing page copy', 'Nội dung trang bảng giá'),
      categoryId: 'store-cat-write',
      start: StoreTeam.at(8, 45),
      minutes: 70,
    ),
    _session(
      l,
      id: 'store-session-inbox',
      title: l.pick('Plan the day', 'Lên kế hoạch trong ngày'),
      categoryId: 'store-cat-write',
      start: StoreTeam.at(8, 15),
      minutes: 25,
    ),
  ];

  static TimeTrackingPeriodStats todayStats(StoreLocale l) {
    final sessions = today(l);
    final byCategory = <String, int>{};
    for (final s in sessions) {
      byCategory.update(
        s.categoryId!,
        (v) => v + s.durationSeconds!,
        ifAbsent: () => s.durationSeconds!,
      );
    }
    final cats = {for (final c in categories(l)) c.id: c};
    final breakdown = byCategory.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return TimeTrackingPeriodStats(
      totalDuration: byCategory.values.fold(0, (a, b) => a + b),
      sessionCount: sessions.length,
      breakdown: [
        for (final e in breakdown)
          TimeTrackingPeriodBreakdown(
            name: cats[e.key]!.name!,
            duration: e.value,
            color: cats[e.key]!.color!,
          ),
      ],
    );
  }

  /// A steady four-month rhythm: weekdays busy, weekends light.
  static TimeTrackerStats stats() {
    final now = DateTime.now();
    final days = <DailyActivity>[];
    for (var i = 120; i >= 0; i--) {
      final date = DateTime(now.year, now.month, now.day - i);
      final weekend =
          date.weekday == DateTime.saturday || date.weekday == DateTime.sunday;
      final seed = (i * 37 + 11) % 10;
      if (weekend && seed < 6) continue;
      final hours = weekend ? 1 + seed % 2 : 3 + seed % 5;
      days.add(
        DailyActivity(
          date: date,
          duration: hours * 3600 + (seed * 7) * 60,
          sessions: weekend ? 1 : 2 + seed % 3,
        ),
      );
    }
    return TimeTrackerStats(
      todayTime: 4 * 3600 + 57 * 60,
      weekTime: 27 * 3600 + 20 * 60,
      monthTime: 96 * 3600 + 45 * 60,
      streak: 18,
      dailyActivity: days,
    );
  }

  static TimeTrackerState state(
    StoreLocale l, {
    HistoryViewMode historyViewMode = HistoryViewMode.day,
    bool withRunning = true,
  }) => TimeTrackerState(
    status: TimeTrackerStatus.loaded,
    lastUpdatedAt: DateTime.now(),
    runningSession: withRunning ? running(l) : null,
    elapsed: const Duration(minutes: 47, seconds: 12),
    recentSessions: today(l),
    categories: categories(l),
    stats: stats(),
    selectedCategoryId: 'store-cat-build',
    historyViewMode: historyViewMode,
    historyAnchorDate: StoreTeam.at(0),
    historySessions: today(l),
    historyPeriodStats: todayStats(l),
    isHistoryStatsAccordionOpen: true,
  );
}

/// The signed-in member, Linh.
const storeTimerSignedIn = AuthState.authenticated(
  User(
    id: 'store-user-linh',
    appMetadata: {},
    userMetadata: {'full_name': 'Linh Tran'},
    aud: 'authenticated',
    email: 'linh@example.com',
    createdAt: '2026-01-05T00:00:00Z',
  ),
);

StoreTimeTrackerCubit storeTimeTrackerCubit(TimeTrackerState state) {
  final cubit = StoreTimeTrackerCubit();
  whenListen(
    cubit,
    const Stream<TimeTrackerState>.empty(),
    initialState: state,
  );
  when(
    () => cubit.loadData(
      any(),
      any(),
      firstDayOfWeek: any(named: 'firstDayOfWeek'),
      forceRefresh: any(named: 'forceRefresh'),
      throwOnError: any(named: 'throwOnError'),
    ),
  ).thenAnswer((_) async {});
  return cubit;
}

StoreTimerAuthCubit storeTimerAuthCubit() {
  final cubit = StoreTimerAuthCubit();
  whenListen(
    cubit,
    const Stream<AuthState>.empty(),
    initialState: storeTimerSignedIn,
  );
  return cubit;
}

StoreTimerWorkspaceCubit storeTimerWorkspaceCubit() {
  final cubit = StoreTimerWorkspaceCubit();
  const workspace = Workspace(
    id: StoreTeam.workspaceId,
    name: StoreTeam.workspaceName,
  );
  whenListen(
    cubit,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: workspace,
      workspaces: [workspace],
    ),
  );
  return cubit;
}

StoreCalendarSettingsCubit storeCalendarSettingsCubit() {
  final cubit = StoreCalendarSettingsCubit();
  whenListen(
    cubit,
    const Stream<CalendarSettingsState>.empty(),
    initialState: const CalendarSettingsState(),
  );
  when(() => cubit.loadWorkspacePreference(any())).thenAnswer((_) async {});
  return cubit;
}
