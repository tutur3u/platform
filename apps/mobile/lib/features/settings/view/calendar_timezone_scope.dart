import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/reminders/reminder_service.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

/// Shared Settings and Calendar preferences for the active account.
class CalendarTimezoneScope extends StatefulWidget {
  const CalendarTimezoneScope({required this.child, super.key});
  final Widget child;
  @override
  State<CalendarTimezoneScope> createState() => _CalendarTimezoneScopeState();
}

class _CalendarTimezoneScopeState extends State<CalendarTimezoneScope>
    with WidgetsBindingObserver {
  late final TimezoneSettingsRepository _repository;
  late final TimezoneSettingsCubit _cubit;
  void _load() => unawaited(
    _cubit.load(
      userId: context.read<AuthCubit>().state.user?.id,
      workspaceId: context.read<WorkspaceCubit>().state.currentWorkspace?.id,
    ),
  );
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _repository = TimezoneSettingsRepository();
    _cubit = TimezoneSettingsCubit(
      repository: _repository,
      deviceLoader: getCurrentTimezoneIdentifier,
    );
    _load();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_cubit.close());
    _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => BlocProvider.value(
    value: _cubit,
    child: MultiBlocListener(
      listeners: [
        BlocListener<TimezoneSettingsCubit, TimezoneSettingsState>(
          listenWhen: (before, after) =>
              before.resolved &&
              after.resolved &&
              !after.loading &&
              !after.saving &&
              !after.failed &&
              (before.personal != after.personal ||
                  before.effective != after.effective),
          listener: (context, state) {
            final userId = context.read<AuthCubit>().state.user?.id;
            if (userId == null) return;
            // Personal and device preferences affect every applicable
            // workspace. The service serializes a normal plan reconciliation.
            unawaited(ReminderService.instance.timezoneChanged(userId: userId));
          },
        ),
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (before, after) => before.user?.id != after.user?.id,
          listener: (_, _) => _load(),
        ),
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (before, after) =>
              before.currentWorkspace?.id != after.currentWorkspace?.id,
          listener: (_, _) => _load(),
        ),
      ],
      child: widget.child,
    ),
  );
}
