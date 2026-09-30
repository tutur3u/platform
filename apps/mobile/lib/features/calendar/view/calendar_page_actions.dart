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
    CalendarEvent event,
  ) async {
    final action = await showEventDetailSheet(context, event: event);

    if (!context.mounted) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    if (action == 'edit') {
      final cubit = context.read<CalendarCubit>();
      final source = cubit.state.events.firstWhere(
        (item) => item.id == event.id,
        orElse: () => event,
      );
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
