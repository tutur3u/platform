part of 'calendar_page.dart';

/// A loaded range bound may fall in a skipped DST hour; the next hour exists.
DateTime _seriesInstant(DateTime wall, String? zone) {
  try {
    return calendarWallToUtc(wall, zone);
  } on FormatException {
    return calendarWallToUtc(wall.add(const Duration(hours: 1)), zone);
  }
}

Map<String, dynamic> _seriesEvent(Map<String, dynamic> result) {
  final location = (result['location'] as String?)?.trim();
  return {
    'title': result['title'],
    'description': result['description'] as String? ?? '',
    'location': location == null || location.isEmpty ? null : location,
    if (result['color'] case final String color) 'color': color,
  };
}

/// The whole series as one editable event: its anchor and stored details.
CalendarEvent _seriesFormEvent(
  NativeCalendarSeries series,
  CalendarSeriesOccurrence occurrence,
  String? calendarTimezone,
) {
  final anchor = series.anchor;
  // All-day dates keep their calendar dates in the calendar's own zone.
  final zone = anchor.allDay ? calendarTimezone : series.rule.timeZone;
  try {
    return occurrence.event.copyWith(
      title: series.title,
      description: series.description,
      location: series.location,
      color: series.color ?? occurrence.event.color,
      startAt: calendarWallToUtc(recurrenceLocalWall(anchor.startLocal), zone),
      endAt: calendarWallToUtc(recurrenceLocalWall(anchor.endLocal), zone),
      isAllDayOverride: anchor.allDay,
    );
  } on FormatException {
    return occurrence.event;
  }
}

Future<CalendarRecurrenceScope?> _showRecurrenceScopeSheet(
  BuildContext context, {
  required bool delete,
}) {
  final l10n = context.l10n;
  return showAppActionSheet<CalendarRecurrenceScope>(
    context: context,
    useRootNavigator: true,
    title: delete
        ? l10n.calendarRecurrenceDelete
        : l10n.calendarRecurrenceScope,
    actions: [
      for (final (scope, label) in [
        (CalendarRecurrenceScope.occurrence, l10n.calendarRecurrenceScopeThis),
        (CalendarRecurrenceScope.future, l10n.calendarRecurrenceScopeFuture),
        (CalendarRecurrenceScope.series, l10n.calendarRecurrenceScopeAll),
      ])
        AppSheetAction(
          key: ValueKey('recurrence-scope-${scope.wire}'),
          label: label,
          value: scope,
          icon: delete ? Icons.delete_outline : Icons.edit_outlined,
          destructive: delete,
        ),
    ],
  );
}

void _seriesToast(BuildContext context, String message) => shad.showToast(
  context: Navigator.of(context, rootNavigator: true).context,
  builder: (context, overlay) => shad.SurfaceCard(child: Text(message)),
);

extension _CalendarPageSeriesActions on _CalendarViewState {
  void _loadSeries(BuildContext context, {bool force = false}) {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final state = context.read<CalendarCubit>().state;
    final range = state.fetchedRange;
    if (wsId == null || range == null) return;
    unawaited(
      context.read<CalendarSeriesCubit>().load(
        wsId,
        DateTimeRange(
          start: _seriesInstant(range.start, state.timezone),
          end: _seriesInstant(range.end, state.timezone),
        ),
        force: force,
      ),
    );
  }

  Future<String> _seriesZone(String? calendarTimezone) async =>
      calendarTimezone ?? await getCurrentTimezoneIdentifier();

  EventRecurrenceOptions _createRecurrence(
    BuildContext context,
    String wsId,
    String zone,
  ) {
    final identity = RecurrenceRequestIdentity();
    final series = context.read<CalendarSeriesCubit>();
    return EventRecurrenceOptions(
      timeZone: zone,
      onSubmit: (result) {
        final rule = result['rule'] as CalendarRecurrenceRule;
        final anchor = result['anchor'] as CalendarRecurrenceAnchor;
        final event = _seriesEvent(result);
        return series.create(
          wsId,
          requestId: identity.idFor([
            'create',
            wsId,
            rule.toJson(),
            anchor.toJson(),
            event,
          ]),
          rule: rule,
          anchor: anchor,
          event: event,
        );
      },
    );
  }

  Future<void> _showOccurrenceDetail(
    BuildContext context,
    CalendarEvent event,
    CalendarSeriesOccurrence occurrence,
  ) async {
    final userId = currentCacheUserId();
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    bool isCurrent() =>
        mounted &&
        context.mounted &&
        currentCacheUserId() == userId &&
        context.read<WorkspaceCubit>().state.currentWorkspace?.id == wsId;
    final l10n = context.l10n;
    final start = occurrence.event.startAt;
    final action = await showEventDetailSheet(
      context,
      event: event,
      readOnly: occurrence.isProviderSeries,
      recurrence: recurrenceSummary(
        l10n,
        RecurrencePattern.fromRule(
          occurrence.rule,
          start == null
              ? calendarNow(occurrence.rule.timeZone)
              : calendarWallDate(start, occurrence.rule.timeZone),
        ),
      ),
      notice: occurrence.isProviderSeries
          ? l10n.calendarRecurrenceProviderReadOnly
          : null,
    );
    if (action == null || occurrence.isProviderSeries) return;
    if (!context.mounted || !isCurrent()) return;
    final scope = await _showRecurrenceScopeSheet(
      context,
      delete: action == 'delete',
    );
    if (scope == null || !context.mounted || !isCurrent()) return;
    if (action == 'delete') {
      await _deleteOccurrence(context, wsId, occurrence, scope, isCurrent);
    } else {
      await _editOccurrence(context, wsId, occurrence, scope, isCurrent);
    }
  }

  Future<void> _deleteOccurrence(
    BuildContext context,
    String wsId,
    CalendarSeriesOccurrence occurrence,
    CalendarRecurrenceScope scope,
    bool Function() isCurrent,
  ) async {
    final series = context.read<CalendarSeriesCubit>();
    final l10n = context.l10n;
    // The revision shown is the one deleted; a newer series answers 409.
    final failure = await series.mutate(
      wsId,
      occurrence,
      expectedRevision: occurrence.seriesRevision,
      delete: true,
      requestId: newLocalMutationId(),
      scope: scope,
    );
    if (failure == null || !context.mounted || !isCurrent()) return;
    if (failure != CalendarSeriesFailure.conflict) {
      _seriesToast(context, recurrenceFailureMessage(l10n, failure));
      return;
    }
    final reload = await showAppConfirmDialog(
      context: context,
      title: l10n.calendarRecurrenceDelete,
      message: l10n.calendarRecurrenceConflict,
      confirmLabel: l10n.calendarRecurrenceReload,
      cancelLabel: l10n.calendarEventCancel,
    );
    if (reload && isCurrent()) await series.reload();
  }

  Future<void> _editOccurrence(
    BuildContext context,
    String wsId,
    CalendarSeriesOccurrence occurrence,
    CalendarRecurrenceScope scope,
    bool Function() isCurrent,
  ) async {
    final seriesCubit = context.read<CalendarSeriesCubit>();
    final calendarTimezone = context.read<CalendarCubit>().state.timezone;
    final identity = RecurrenceRequestIdentity();
    while (true) {
      final NativeCalendarSeries series;
      try {
        series = await seriesCubit.readSeries(wsId, occurrence.seriesId);
      } on Object catch (error) {
        if (context.mounted && isCurrent()) {
          _seriesToast(
            context,
            recurrenceFailureMessage(
              context.l10n,
              calendarSeriesFailureOf(error),
            ),
          );
        }
        return;
      }
      if (!context.mounted || !isCurrent()) return;
      final whole = scope == CalendarRecurrenceScope.series;
      final source = whole
          ? _seriesFormEvent(series, occurrence, calendarTimezone)
          : occurrence.event;
      final startWall = whole
          ? recurrenceLocalWall(series.anchor.startLocal)
          : calendarWallDate(source.startAt!, series.rule.timeZone);
      final result = await showEventFormSheet(
        context,
        event: source,
        timezone: calendarTimezone,
        isCurrentScope: isCurrent,
        recurrence: EventRecurrenceOptions(
          timeZone: series.rule.timeZone,
          scope: scope,
          pattern: scope == CalendarRecurrenceScope.occurrence
              ? null
              : RecurrencePattern.fromRule(series.rule, startWall),
          // The first occurrence's future edit applies to the whole series.
          showFutureReset:
              scope == CalendarRecurrenceScope.future &&
              occurrence.originalStartLocal != series.anchor.startLocal,
          onSubmit: (result) {
            final event = _seriesEvent(result);
            final rule = result['rule'] as CalendarRecurrenceRule?;
            final anchor = result['timesChanged'] == true
                ? result['anchor'] as CalendarRecurrenceAnchor
                : null;
            return seriesCubit.mutate(
              wsId,
              occurrence,
              expectedRevision: series.revision,
              delete: false,
              requestId: identity.idFor([
                scope.wire,
                series.id,
                series.revision,
                occurrence.originalStartLocal,
                event,
                rule?.toJson(),
                anchor?.toJson(),
              ]),
              scope: scope,
              event: event,
              rule: rule,
              anchor: anchor,
            );
          },
        ),
      );
      if (result?['reload'] != true || !context.mounted || !isCurrent()) return;
      unawaited(seriesCubit.reload());
    }
  }
}
