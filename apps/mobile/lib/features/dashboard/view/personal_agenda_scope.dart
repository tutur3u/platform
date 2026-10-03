import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

/// Resolve user → personal workspace → device, never the selected shared zone.
class PersonalAgendaScope extends StatefulWidget {
  const PersonalAgendaScope({
    required this.userId,
    required this.workspaceId,
    required this.settings,
    required this.child,
    this.repository,
    super.key,
  });

  final String userId;
  final String workspaceId;
  final TimezoneSettingsCubit settings;
  final CalendarRepository? repository;
  final Widget child;

  @override
  State<PersonalAgendaScope> createState() => _PersonalAgendaScopeState();
}

class _PersonalAgendaScopeState extends State<PersonalAgendaScope> {
  late final CalendarRepository _repository;
  late final CalendarCubit _calendar;
  late final TimezoneSettingsCubit _timezone;
  StreamSubscription<TimezoneSettingsState>? _subscription;
  Future<void> _calendarRefresh = Future<void>.value();
  int _calendarRevision = 0;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? CalendarRepository();
    _calendar = CalendarCubit(
      calendarRepository: _repository,
      initialState: CalendarCubit.seedStateForWorkspace(widget.workspaceId),
    );
    _timezone = TimezoneSettingsCubit(
      repository: widget.settings.repository,
      deviceLoader: widget.settings.deviceLoader,
    );
    _subscription = _timezone.stream.listen((state) {
      if (state.loading) return;
      final revision = ++_calendarRevision;
      // Finish the prior cache write before changing timezone/query range.
      // Intermediate settings changes are superseded by the latest resolution.
      _calendarRefresh = _calendarRefresh.then((_) async {
        if (!mounted || revision != _calendarRevision) return;
        _calendar.setTimezone(state.resolved ? state.effective : null);
        await _calendar.loadEvents(widget.workspaceId, forceRefresh: true);
      });
      unawaited(_calendarRefresh);
    });
    unawaited(_reloadTimezone());
  }

  Future<void> _reloadTimezone() => ApiClient.runForUser(
    widget.userId,
    () =>
        _timezone.load(userId: widget.userId, workspaceId: widget.workspaceId),
  );

  @override
  void dispose() {
    unawaited(_subscription?.cancel());
    unawaited(_timezone.close());
    unawaited(_calendar.close());
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(
    BuildContext context,
  ) => BlocListener<TimezoneSettingsCubit, TimezoneSettingsState>(
    bloc: widget.settings,
    // A save or settings reload can change the user preference or the personal
    // workspace's fallback. Re-read our own scope even when shared is selected.
    listenWhen: (previous, current) =>
        !current.loading &&
        !current.saving &&
        (previous.loading ||
            previous.saving ||
            previous.personal != current.personal ||
            previous.workspace != current.workspace ||
            previous.device != current.device),
    listener: (_, _) => unawaited(_reloadTimezone()),
    child: BlocProvider<CalendarCubit>.value(
      value: _calendar,
      child: widget.child,
    ),
  );
}
