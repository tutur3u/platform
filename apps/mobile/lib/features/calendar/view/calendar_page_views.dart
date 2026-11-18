part of 'calendar_page.dart';

extension _CalendarPageViews on _CalendarViewState {
  Widget _buildViewBody(
    BuildContext context,
    CalendarState state,
    int firstDayOfWeek,
  ) {
    switch (state.viewMode) {
      case CalendarViewMode.day:
        return CalendarDayPanel(
          child: MultiDayScheduleView(
            resetGeneration: _resetGeneration,
            timelineZoom: state.timelineZoom,
            zoomScope: context.read<CalendarCubit>().timelineZoomScope,
            onTimelineZoomEnd: _zoomHandler(context),
            visibleDayCount: 1,
            selectedDate: state.effectiveSelectedDate,
            events: state.displayEvents,
            onDaySelected: (date) =>
                context.read<CalendarCubit>().selectDate(date),
            onEventTap: (event) => _showEventDetail(context, event),
            onCreateAtTime: (time) => _createEvent(context, startTime: time),
            onSwipe: (delta) => _navigateDays(context, delta),
          ),
        );
      case CalendarViewMode.threeDays:
        return ThreeDayView(
          resetGeneration: _resetGeneration,
          timelineZoom: state.timelineZoom,
          zoomScope: context.read<CalendarCubit>().timelineZoomScope,
          onTimelineZoomEnd: _zoomHandler(context),
          selectedDate: state.effectiveSelectedDate,
          events: state.displayEvents,
          onEventTap: (event) => _showEventDetail(context, event),
          onCreateAtTime: (time) => _createEvent(context, startTime: time),
          onDaySelected: (date) {
            final cubit = context.read<CalendarCubit>()..selectDate(date);
            unawaited(cubit.setViewMode(CalendarViewMode.day));
          },
          onSwipe: (delta) => _navigateDays(context, delta),
        );
      case CalendarViewMode.week:
        return WeekView(
          resetGeneration: _resetGeneration,
          timelineZoom: state.timelineZoom,
          zoomScope: context.read<CalendarCubit>().timelineZoomScope,
          onTimelineZoomEnd: _zoomHandler(context),
          selectedDate: state.effectiveSelectedDate,
          events: state.displayEvents,
          firstDayOfWeek: firstDayOfWeek,
          onEventTap: (event) => _showEventDetail(context, event),
          onCreateAtTime: (time) => _createEvent(context, startTime: time),
          onDaySelected: (date) {
            final cubit = context.read<CalendarCubit>()..selectDate(date);
            unawaited(cubit.setViewMode(CalendarViewMode.day));
          },
          onSwipe: (delta) => _navigateDays(context, delta),
        );
      case CalendarViewMode.month:
        return RefreshCanvas(
          child: MonthView(
            selectedDate: state.effectiveSelectedDate,
            focusedMonth: state.effectiveFocusedMonth,
            events: state.displayEvents,
            firstDayOfWeek: firstDayOfWeek,
            onDaySelected: (date) {
              final cubit = context.read<CalendarCubit>()..selectDate(date);
              unawaited(cubit.setViewMode(CalendarViewMode.day));
            },
          ),
        );
      case CalendarViewMode.agenda:
        return AgendaView(
          resetGeneration: _resetGeneration,
          selectedDate: state.effectiveSelectedDate,
          events: state.displayEvents,
          isLoadingMore: state.isLoadingMore,
          onEventTap: (event) => _showEventDetail(context, event),
          onDaySelected: (date) {
            final cubit = context.read<CalendarCubit>()..selectDate(date);
            unawaited(cubit.setViewMode(CalendarViewMode.day));
          },
          onLoadMore: () {
            final wsId = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace
                ?.id;
            if (wsId != null) {
              unawaited(context.read<CalendarCubit>().loadMoreForward(wsId));
            }
          },
        );
      case CalendarViewMode.year:
        return YearView(
          key: ValueKey(_resetGeneration),
          selectedDate: state.effectiveSelectedDate,
          focusedMonth: state.effectiveFocusedMonth,
          events: state.displayEvents,
          firstDayOfWeek: firstDayOfWeek,
          onDaySelected: (date) {
            final cubit = context.read<CalendarCubit>()..selectDate(date);
            unawaited(cubit.setViewMode(CalendarViewMode.month));
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
}
