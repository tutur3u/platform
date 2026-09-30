import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

class CalendarTimezoneListener extends StatelessWidget {
  const CalendarTimezoneListener({required this.child, super.key});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final preferences = context.read<TimezoneSettingsCubit?>();
    if (preferences == null) return child;
    return BlocListener<TimezoneSettingsCubit, TimezoneSettingsState>(
      bloc: preferences,
      listenWhen: (before, after) =>
          before.resolved != after.resolved ||
          (!after.loading &&
              !after.failed &&
              (before.loading || before.effective != after.effective)),
      listener: (context, state) {
        final cubit = context.read<CalendarCubit>()
          ..setTimezone(state.resolved ? state.effective : null);
        if (!state.resolved || state.loading || state.failed) return;
        final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
        if (wsId != null) unawaited(cubit.loadEvents(wsId, forceRefresh: true));
      },
      child: child,
    );
  }
}
