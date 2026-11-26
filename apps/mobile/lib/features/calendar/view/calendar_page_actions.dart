part of 'calendar_page.dart';

extension _CalendarPageActions on _CalendarViewState {
  Future<void> _createEvent(BuildContext context, {DateTime? startTime}) async {
    final userId = currentCacheUserId();
    final cubit = context.read<CalendarCubit>();
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final zone = await _seriesZone(cubit.state.timezone);
    if (!context.mounted) return;
    final result = await showEventFormSheet(
      context,
      initialStartTime: startTime,
      timezone: cubit.state.timezone,
      recurrence: _createRecurrence(context, wsId, zone),
      isCurrentScope: () =>
          mounted &&
          context.mounted &&
          currentCacheUserId() == userId &&
          context.read<WorkspaceCubit>().state.currentWorkspace?.id == wsId,
    );
    if (result == null ||
        result['series'] == true ||
        !context.mounted ||
        currentCacheUserId() != userId ||
        context.read<WorkspaceCubit>().state.currentWorkspace?.id != wsId) {
      return;
    }

    await cubit.createEvent(
      wsId,
      title: result['title'] as String,
      description: result['description'] as String?,
      location: result['location'] as String?,
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
    // Virtual occurrences change only through scoped series operations.
    final occurrence = context.read<CalendarSeriesCubit>().occurrenceFor(
      event.id,
    );
    if (occurrence != null) {
      await _showOccurrenceDetail(context, event, occurrence);
      return;
    }
    final originalUserId = currentCacheUserId();
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
    final eventWorkspaceId =
        rawEvent?.wsId ?? event.wsId ?? originalWorkspaceId;
    final workspaceCubit = context.read<WorkspaceCubit>();
    final action = await showEventDetailSheet(
      context,
      event: event,
      guests:
          isUuid(event.id) &&
              eventWorkspaceId != null &&
              originalWorkspaceId != null &&
              originalUserId != null
          ? EventGuestsPanel(
              event: rawEvent ?? event,
              workspaceId: eventWorkspaceId,
              scopeIsCurrent: () =>
                  mounted &&
                  context.mounted &&
                  currentCacheUserId() == originalUserId &&
                  workspaceCubit.state.currentWorkspace?.id ==
                      originalWorkspaceId,
            )
          : null,
    );

    if (!mounted ||
        !context.mounted ||
        currentCacheUserId() != originalUserId) {
      return;
    }

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null || wsId != originalWorkspaceId) {
      return;
    }

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
      final colors = cubit.getGoogleColorOptions(wsId, source);
      final result = await showEventFormSheet(
        context,
        providerColorsFuture: colors,
        isCurrentScope: () =>
            mounted &&
            context.mounted &&
            currentCacheUserId() == originalUserId &&
            context.read<WorkspaceCubit>().state.currentWorkspace?.id == wsId,
        event: source,
        timezone: cubit.state.timezone,
      );
      if (result == null ||
          !context.mounted ||
          currentCacheUserId() != originalUserId ||
          context.read<WorkspaceCubit>().state.currentWorkspace?.id != wsId) {
        return;
      }
      final choice = result['providerColor'];
      if (choice is GoogleCalendarColorChoice) {
        await cubit.updateProviderColor(wsId, event.id, choice);
        return;
      }

      await cubit.updateEvent(
        wsId,
        event.id,
        title: result['title'] as String?,
        description: result['description'] as String?,
        location: result['location'] as String?,
        startAt: result['startAt'] as DateTime?,
        endAt: result['endAt'] as DateTime?,
        color: result['color'] as String?,
      );
    } else if (action == 'delete') {
      await context.read<CalendarCubit>().deleteEvent(wsId, event.id);
    }
  }
}
