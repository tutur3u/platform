part of 'calendar_page.dart';

extension _CalendarPageActions on _CalendarViewState {
  Future<void> _createEvent(BuildContext context, {DateTime? startTime}) async {
    final cubit = context.read<CalendarCubit>();
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final result = await showEventFormSheet(
      context,
      initialStartTime: startTime,
      timezone: cubit.state.timezone,
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
    CalendarEvent event, {
    CalendarEvent? sourceEvent,
  }) async {
    final originalWorkspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    final cubit = context.read<CalendarCubit>();
    var rawEvent = sourceEvent;
    for (final item in cubit.state.events) {
      if (item.id == event.id) rawEvent = item;
    }
    final action = await showEventDetailSheet(context, event: event);

    if (!mounted || !context.mounted) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null || wsId != originalWorkspaceId) return;

    if (action == 'edit') {
      // Detail views carry projected wall times. Editing always needs raw
      // instants, including while a deep-link range load is pending or fails.
      for (final item in cubit.state.events) {
        if (item.id == event.id) rawEvent = item;
      }
      final source = rawEvent;
      if (source == null) {
        shad.showToast(
          context: Navigator.of(context, rootNavigator: true).context,
          builder: (context, overlay) => shad.SurfaceCard(
            child: Text(context.l10n.calendarEventUnavailable),
          ),
        );
        return;
      }
      final result = await showEventFormSheet(
        context,
        event: source,
        timezone: cubit.state.timezone,
      );
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
