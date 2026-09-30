import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
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

class _CalendarTimezoneScopeState extends State<CalendarTimezoneScope> {
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
    _repository = TimezoneSettingsRepository();
    _cubit = TimezoneSettingsCubit(
      repository: _repository,
      deviceLoader: getCurrentTimezoneIdentifier,
    );
    _load();
  }

  @override
  void dispose() {
    unawaited(_cubit.close());
    _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => BlocProvider.value(
    value: _cubit,
    child: MultiBlocListener(
      listeners: [
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
