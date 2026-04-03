import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/router/routes.dart';
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
import 'package:mobile/features/calendar/widgets/year_view.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class CalendarPage extends StatelessWidget {
  const CalendarPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
        final cubit = CalendarCubit(
          calendarRepository: CalendarRepository(),
          initialState: wsId != null
              ? CalendarCubit.cachedStateForWorkspace(wsId)
              : null,
        );
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
      child: Stack(
        children: [
          BlocBuilder<CalendarCubit, CalendarState>(
            buildWhen: (prev, curr) => prev.viewMode != curr.viewMode,
            builder: (context, state) {
              return ShellMiniNav(
                ownerId: 'calendar-view-modes',
                locations: const {Routes.calendar},
                deepLinkBackRoute: Routes.apps,
                items: [
                  ShellMiniNavItemSpec(
                    id: 'back',
                    icon: Icons.chevron_left,
                    label: l10n.navBack,
                    callbackToken: 'back',
                    onPressed: () => context.go(Routes.apps),
                  ),
                  _buildMiniNavItem(
                    context,
                    id: 'agenda',
                    label: l10n.calendarAgendaView,
                    icon: Icons.view_agenda_outlined,
                    selected: state.viewMode == CalendarViewMode.agenda,
                    mode: CalendarViewMode.agenda,
                  ),
                  _buildMiniNavItem(
                    context,
                    id: 'calendar',
                    label: l10n.calendarTitle,
                    icon: Icons.calendar_view_month,
                    selected: _isCalendarTabSelected(state.viewMode),
                    mode: _calendarTabModeFor(state.viewMode),
                  ),
                  _buildMiniNavItem(
                    context,
                    id: 'year',
                    label: l10n.calendarYearView,
                    icon: Icons.calendar_month_outlined,
                    selected: state.viewMode == CalendarViewMode.year,
                    mode: CalendarViewMode.year,
                  ),
                ],
              );
            },
          ),
          BlocBuilder<CalendarCubit, CalendarState>(
            buildWhen: (prev, curr) =>
                prev.viewMode != curr.viewMode ||
                prev.status != curr.status ||
                prev.events.length != curr.events.length,
            builder: (context, state) {
              final wsId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              return ShellChromeActions(
                ownerId: 'calendar-root',
                locations: const {Routes.calendar},
                actions: [
                  if (_isCalendarTabSelected(state.viewMode))
                    ShellActionSpec(
                      id: 'calendar-view-selector',
                      icon: Icons.arrow_drop_down_circle_outlined,
                      tooltip: _calendarModeLabel(context, state.viewMode),
                      callbackToken: 'calendar-view-${state.viewMode.name}',
                      onPressed: () => _showCalendarModeMenu(context, state),
                      highlighted: true,
                    ),
                  if (Env.isCalendarIntegrationsEnabled)
                    ShellActionSpec(
                      id: 'calendar-connections',
                      icon: Icons.sync_alt,
                      tooltip: l10n.calendarConnectionsTitle,
                      enabled: wsId != null && wsId.isNotEmpty,
                      onPressed: () {
                        if (wsId == null || wsId.isEmpty) {
                          return;
                        }
                        unawaited(
                          showCalendarConnectionsSheet(context, wsId: wsId),
                        );
                      },
                    ),
                  ShellActionSpec(
                    id: 'calendar-today',
                    icon: Icons.today,
                    tooltip: l10n.calendarToday,
                    enabled: wsId != null && wsId.isNotEmpty,
                    onPressed: () {
                      final cubit = context.read<CalendarCubit>()..goToToday();
                      if (wsId != null && wsId.isNotEmpty) {
                        unawaited(
                          cubit.ensureRangeLoaded(wsId, DateTime.now()),
                        );
                      }
                    },
                  ),
                ],
              );
            },
          ),
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
                  return const Center(child: NovaLoadingIndicator());
                }

                if (state.status == CalendarStatus.error &&
                    state.events.isEmpty) {
                  return _ErrorView(error: state.error);
                }

                return RefreshIndicator(
                  onRefresh: () async => _reload(context),
                  child: Column(
                    children: [
                      // Month strip for agenda and schedule-style views.
                      if (state.viewMode == CalendarViewMode.day ||
                          state.viewMode == CalendarViewMode.threeDays ||
                          state.viewMode == CalendarViewMode.week ||
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
                            context.read<CalendarCubit>().setFocusedMonth(
                              month,
                            );
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
          onEventTap: (event) => _showEventDetail(context, event),
          onCreateAtTime: (time) => _createEvent(context, startTime: time),
          onDaySelected: (date) {
            context.read<CalendarCubit>()
              ..selectDate(date)
              ..setViewMode(CalendarViewMode.day);
          },
          onSwipe: (delta) => _navigateDays(context, delta),
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
      case CalendarViewMode.year:
        return YearView(
          selectedDate: state.effectiveSelectedDate,
          focusedMonth: state.effectiveFocusedMonth,
          events: state.events,
          firstDayOfWeek: firstDayOfWeek,
          onDaySelected: (date) {
            final cubit = context.read<CalendarCubit>()
              ..selectDate(date)
              ..setViewMode(CalendarViewMode.month);
            final wsId = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace
                ?.id;
            if (wsId != null) {
              unawaited(cubit.ensureRangeLoaded(wsId, date));
            }
          },
          onYearChanged: (month) {
            final cubit = context.read<CalendarCubit>()..setFocusedMonth(month);
            final wsId = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace
                ?.id;
            if (wsId != null) {
              unawaited(cubit.ensureRangeLoaded(wsId, month));
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

  ShellMiniNavItemSpec _buildMiniNavItem(
    BuildContext context, {
    required String id,
    required String label,
    required IconData icon,
    required bool selected,
    required CalendarViewMode mode,
  }) {
    return ShellMiniNavItemSpec(
      id: id,
      icon: icon,
      label: label,
      selected: selected,
      callbackToken: '$id-${selected ? 'selected-' : ''}${mode.name}',
      onPressed: () {
        final cubit = context.read<CalendarCubit>()..setViewMode(mode);
        final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
        if (wsId != null) {
          unawaited(
            cubit.ensureRangeLoaded(wsId, cubit.state.effectiveSelectedDate),
          );
        }
      },
    );
  }

  void _showCalendarModeMenu(
    BuildContext context,
    CalendarState state,
  ) {
    final currentMode = _calendarTabModeFor(state.viewMode);
    shad.showDropdown<void>(
      context: context,
      builder: (builderContext) {
        return shad.DropdownMenu(
          children: [
            _buildCalendarModeButton(
              context,
              currentMode: currentMode,
              mode: CalendarViewMode.day,
              label: builderContext.l10n.calendarDayView,
            ),
            _buildCalendarModeButton(
              context,
              currentMode: currentMode,
              mode: CalendarViewMode.threeDays,
              label: builderContext.l10n.calendarThreeDayView,
            ),
            _buildCalendarModeButton(
              context,
              currentMode: currentMode,
              mode: CalendarViewMode.week,
              label: builderContext.l10n.calendarWeekView,
            ),
            _buildCalendarModeButton(
              context,
              currentMode: currentMode,
              mode: CalendarViewMode.month,
              label: builderContext.l10n.calendarMonthView,
            ),
          ],
        );
      },
    );
  }

  shad.MenuButton _buildCalendarModeButton(
    BuildContext rootContext, {
    required CalendarViewMode currentMode,
    required CalendarViewMode mode,
    required String label,
  }) {
    return shad.MenuButton(
      leading: currentMode == mode
          ? const Icon(Icons.check, size: 16)
          : const SizedBox(width: 16, height: 16),
      onPressed: (menuContext) {
        final cubit = rootContext.read<CalendarCubit>()..setViewMode(mode);
        final wsId = rootContext
            .read<WorkspaceCubit>()
            .state
            .currentWorkspace
            ?.id;
        if (wsId != null) {
          unawaited(
            cubit.ensureRangeLoaded(wsId, cubit.state.effectiveSelectedDate),
          );
        }
      },
      child: Text(label),
    );
  }

  bool _isCalendarTabSelected(CalendarViewMode mode) {
    return mode == CalendarViewMode.day ||
        mode == CalendarViewMode.threeDays ||
        mode == CalendarViewMode.week ||
        mode == CalendarViewMode.month;
  }

  CalendarViewMode _calendarTabModeFor(CalendarViewMode mode) {
    if (_isCalendarTabSelected(mode)) {
      return mode;
    }
    return CalendarViewMode.threeDays;
  }

  String _calendarModeLabel(BuildContext context, CalendarViewMode mode) {
    final l10n = context.l10n;
    return switch (_calendarTabModeFor(mode)) {
      CalendarViewMode.day => l10n.calendarDayView,
      CalendarViewMode.threeDays => l10n.calendarThreeDayView,
      CalendarViewMode.week => l10n.calendarWeekView,
      CalendarViewMode.month => l10n.calendarMonthView,
      CalendarViewMode.agenda ||
      CalendarViewMode.year => l10n.calendarThreeDayView,
    };
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
    unawaited(
      context.read<CalendarCubit>().loadEvents(wsId, forceRefresh: true),
    );
  }
}
