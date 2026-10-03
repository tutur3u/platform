import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/calendar_event.dart';

List<CalendarEvent> overlayPendingCalendarEvents(
  String workspaceId,
  List<CalendarEvent> source,
  List<PendingMutationRecord> pending, {
  DateTime? start,
  DateTime? end,
}) {
  final rows = {for (final event in source) event.id: event};
  for (final mutation in pending) {
    final base = '/api/v1/workspaces/$workspaceId/calendar/events';
    if (mutation.feature != 'calendar' ||
        mutation.workspaceId != workspaceId ||
        (mutation.path != base && !mutation.path.startsWith('$base/'))) {
      continue;
    }
    final id = mutation.entityId;
    if (id == null) continue;
    if (mutation.method == 'DELETE') {
      rows.remove(id);
      continue;
    }
    final payload = mutation.payload;
    if (payload == null) continue;
    final previous = rows[id];
    if (mutation.method == 'PUT' &&
        previous == null &&
        (payload['start_at'] == null || payload['end_at'] == null)) {
      continue;
    }
    final event = CalendarEvent.fromJson({
      ...?previous?.toJson(),
      ...payload,
      'id': id,
      'ws_id': workspaceId,
      'created_at':
          previous?.createdAt?.toIso8601String() ??
          mutation.createdAt.toIso8601String(),
    });
    final eventStart = event.startAt;
    final eventEnd = event.endAt;
    if ((start != null && eventEnd != null && !eventEnd.isAfter(start)) ||
        (end != null && eventStart != null && !eventStart.isBefore(end))) {
      rows.remove(id);
    } else {
      rows[id] = event;
    }
  }
  return rows.values
      .where(
        (event) =>
            (start == null ||
                event.endAt == null ||
                event.endAt!.isAfter(start)) &&
            (end == null ||
                event.startAt == null ||
                event.startAt!.isBefore(end)),
      )
      .toList(growable: false)
    ..sort(
      (a, b) => (a.startAt ?? DateTime(0)).compareTo(b.startAt ?? DateTime(0)),
    );
}
