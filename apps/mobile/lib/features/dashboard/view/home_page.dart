import 'package:flutter/material.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';

/// The Home root destination. Its header keeps only the shell title and
/// Customise; Calendar opens from More or a pinned tab.
class HomePage extends StatelessWidget {
  const HomePage({
    this.replayToken = 0,
    this.taskListCubit,
    this.calendarCubit,
    super.key,
  });
  final int replayToken;

  /// Pre-built Home data sources for render tests; see [DashboardPage].
  @visibleForTesting
  final TaskListCubit? taskListCubit;
  @visibleForTesting
  final CalendarCubit? calendarCubit;

  @override
  Widget build(BuildContext context) => DashboardPage(
    replayToken: replayToken,
    taskListCubit: taskListCubit,
    calendarCubit: calendarCubit,
  );
}
