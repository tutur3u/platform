import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/calendar/widgets/calendar_connections_sheet.dart';
import 'package:mobile/features/calendar/widgets/day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/event_detail_sheet.dart';
import 'package:mobile/features/calendar/widgets/event_form_sheet.dart';
import 'package:mobile/features/calendar/widgets/month_strip.dart';
import 'package:mobile/features/calendar/widgets/month_view.dart';
import 'package:mobile/features/calendar/widgets/three_day_view.dart';
import 'package:mobile/features/calendar/widgets/week_view.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class CalendarPage extends StatelessWidget {
  const CalendarPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final cubit = CalendarCubit(
          calendarRepository: CalendarRepository(),
        );
        final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
        if (wsId != null) unawaited(cubit.loadEvents(wsId));
        return cubit;
      },
      child: const _CalendarView(),
    );
  }
}

class _CalendarView extends StatelessWidget {
  const _CalendarView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final calSettings = context.watch<CalendarSettingsCubit>().state;
    final locale = Localizations.localeOf(context);
    final firstDayOfWeek = calSettings.resolvedFirstDayIndex(
      locale.languageCode,
    );

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: BlocBuilder<CalendarCubit, CalendarState>(
            buildWhen: (prev, curr) =>
                prev.effectiveFocusedMonth != curr.effectiveFocusedMonth,
            builder: (context, state) {
              final month = state.effectiveFocusedMonth;
              return Text(DateFormat.yMMMM().format(month));
            },
          ),
          trailing: [
            // Calendar connections.
            Tooltip(
              message: l10n.calendarConnectionsTitle,
              child: shad.IconButton.ghost(
                icon: const Icon(Icons.sync_alt),
                onPressed: () {
                  final wsId = context
                      .read<WorkspaceCubit>()
                      .state
                      .currentWorkspace
                      ?.id;
                  if (wsId != null) {
                    unawaited(
                      showCalendarConnectionsSheet(context, wsId: wsId),
                    );
                  }
                },
              ),
            ),
            // Today button.
            Tooltip(
              message: l10n.calendarToday,
              child: shad.IconButton.ghost(
                icon: const Icon(Icons.today),
                onPressed: () {
                  final cubit = context.read<CalendarCubit>()..goToToday();
                  final wsId = context
                      .read<WorkspaceCubit>()
                      .state
                      .currentWorkspace
                      ?.id;
                  if (wsId != null) {
                    unawaited(cubit.ensureRangeLoaded(wsId, DateTime.now()));
                  }
                },
              ),
            ),
            // View mode.
            BlocBuilder<CalendarCubit, CalendarState>(
              buildWhen: (prev, curr) => prev.viewMode != curr.viewMode,
              builder: (context, state) {
                return PopupMenuButton<CalendarViewMode>(
                  icon: const Icon(Icons.view_agenda_outlined),
                  onSelected: (mode) {
                    context.read<CalendarCubit>().setViewMode(mode);
                  },
                  itemBuilder: (_) => [
                    for (final mode in CalendarViewMode.values)
                      PopupMenuItem(
                        value: mode,
                        child: Row(
                          children: [
                            if (state.viewMode == mode)
                              const Icon(Icons.check, size: 18)
                            else
                              const SizedBox(width: 18),
                            const SizedBox(width: 8),
                            Text(_viewModeLabel(l10n, mode)),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ],
      child: Stack(
        children: [
          BlocListener<WorkspaceCubit, WorkspaceState>(
            listenWhen: (prev, curr) =>
                prev.currentWorkspace?.id != curr.currentWorkspace?.id,
            listener: (context, state) {
              final wsId = state.currentWorkspace?.id;
              if (wsId != null) {
                unawaited(context.read<CalendarCubit>().loadEvents(wsId));
              }
            },
            child: BlocBuilder<CalendarCubit, CalendarState>(
              builder: (context, state) {
                if (state.status == CalendarStatus.loading &&
                    state.events.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (state.status == CalendarStatus.error &&
                    state.events.isEmpty) {
                  return _ErrorView(error: state.error);
                }

                return RefreshIndicator(
                  onRefresh: () async => _reload(context),
                  child: Column(
                    children: [
                      // Month strip (day, 3-day, and agenda views).
                      if (state.viewMode == CalendarViewMode.day ||
                          state.viewMode == CalendarViewMode.threeDays ||
                          state.viewMode == CalendarViewMode.agenda)
                        MonthStrip(
                          selectedDate: state.effectiveSelectedDate,
                          focusedMonth: state.effectiveFocusedMonth,
                          events: state.events,
                          firstDayOfWeek: firstDayOfWeek,
                          onDateSelected: (date) {
                            final cubit = context.read<CalendarCubit>()
                              ..selectDate(date);
                            final wsId = context
                                .read<WorkspaceCubit>()
                                .state
                                .currentWorkspace
                                ?.id;
                            if (wsId != null) {
                              unawaited(cubit.ensureRangeLoaded(wsId, date));
                            }
                          },
                          onMonthChanged: (month) {
                            context.read<CalendarCubit>().setFocusedMonth(month);
                          },
                        ),
                      // View body.
                      Expanded(
                        child: _buildViewBody(context, state, firstDayOfWeek),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          Positioned(
            right: 16,
            bottom: 16,
            child: FloatingActionButton(
              heroTag: 'calendar_fab',
              onPressed: () => _createEvent(context),
              child: const Icon(Icons.add),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildViewBody(
    BuildContext context,
    CalendarState state,
    int firstDayOfWeek,
  ) {
    switch (state.viewMode) {
      case CalendarViewMode.day:
        return DayScheduleView(
          selectedDate: state.effectiveSelectedDate,
          allDayEvents: state.allDayEvents,
          timedEvents: state.timedEvents,
          onEventTap: (event) => _showEventDetail(context, event),
          onCreateAtTime: (time) => _createEvent(context, startTime: time),
          onSwipe: (delta) => _navigateDays(context, delta),
        );
      case CalendarViewMode.threeDays:
        return ThreeDayView(
          selectedDate: state.effectiveSelectedDate,
          events: state.events,
          onEventTap: (event) => _showEventDetail(context, event),
          onCreateAtTime: (time) => _createEvent(context, startTime: time),
          onDaySelected: (date) {
            context.read<CalendarCubit>()
              ..selectDate(date)
              ..setViewMode(CalendarViewMode.day);
          },
          onSwipe: (delta) => _navigateDays(context, delta),
        );
      case CalendarViewMode.week:
        return WeekView(
          selectedDate: state.effectiveSelectedDate,
          events: state.events,
          firstDayOfWeek: firstDayOfWeek,
          onDaySelected: (date) {
            context.read<CalendarCubit>()
              ..selectDate(date)
              ..setViewMode(CalendarViewMode.day);
          },
        );
      case CalendarViewMode.month:
        return MonthView(
          selectedDate: state.effectiveSelectedDate,
          focusedMonth: state.effectiveFocusedMonth,
          events: state.events,
          firstDayOfWeek: firstDayOfWeek,
          onDaySelected: (date) {
            context.read<CalendarCubit>()
              ..selectDate(date)
              ..setViewMode(CalendarViewMode.day);
          },
        );
      case CalendarViewMode.agenda:
        return AgendaView(
          selectedDate: state.effectiveSelectedDate,
          events: state.events,
          isLoadingMore: state.isLoadingMore,
          onEventTap: (event) => _showEventDetail(context, event),
          onDaySelected: (date) {
            context.read<CalendarCubit>()
              ..selectDate(date)
              ..setViewMode(CalendarViewMode.day);
          },
          onLoadMore: () {
            final wsId = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace
                ?.id;
            if (wsId != null) {
              unawaited(
                context.read<CalendarCubit>().loadMoreForward(wsId),
              );
            }
          },
        );
    }
  }

  void _navigateDays(BuildContext context, int delta) {
    final cubit = context.read<CalendarCubit>()..navigateDay(delta);
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId != null) {
      unawaited(
        cubit.ensureRangeLoaded(wsId, cubit.state.effectiveSelectedDate),
      );
    }
  }

  String _viewModeLabel(AppLocalizations l10n, CalendarViewMode mode) {
    switch (mode) {
      case CalendarViewMode.day:
        return l10n.calendarDayView;
      case CalendarViewMode.threeDays:
        return l10n.calendarThreeDayView;
      case CalendarViewMode.week:
        return l10n.calendarWeekView;
      case CalendarViewMode.month:
        return l10n.calendarMonthView;
      case CalendarViewMode.agenda:
        return l10n.calendarAgendaView;
    }
  }

  Future<void> _createEvent(
    BuildContext context, {
    DateTime? startTime,
  }) async {
    final cubit = context.read<CalendarCubit>();
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final result = await showEventFormSheet(
      context,
      initialStartTime: startTime,
    );
    if (result == null) return;

    await cubit.createEvent(
      wsId,
      title: result['title'] as String,
      description: result['description'] as String?,
      startAt: result['startAt'] as DateTime,
      endAt: result['endAt'] as DateTime,
      color: result['color'] as String?,
    );
  }

  Future<void> _showEventDetail(
    BuildContext context,
    CalendarEvent event,
  ) async {
    final action = await showEventDetailSheet(context, event: event);

    if (!context.mounted) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    if (action == 'edit') {
      final cubit = context.read<CalendarCubit>();
      final result = await showEventFormSheet(context, event: event);
      if (result == null) return;

      await cubit.updateEvent(
        wsId,
        event.id,
        title: result['title'] as String?,
        description: result['description'] as String?,
        startAt: result['startAt'] as DateTime?,
        endAt: result['endAt'] as DateTime?,
        color: result['color'] as String?,
      );
    } else if (action == 'delete') {
      await context.read<CalendarCubit>().deleteEvent(wsId, event.id);
    }
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: Theme.of(context).colorScheme.error,
          ),
          const SizedBox(height: 16),
          Text(
            error ?? l10n.calendarTitle,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          FilledButton.tonal(
            onPressed: () => _reload(context),
            child: Text(l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}

void _reload(BuildContext context) {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId != null) {
    unawaited(context.read<CalendarCubit>().loadEvents(wsId));
  }
}
