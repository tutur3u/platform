import 'package:mobile/data/models/calendar_event.dart';

/// Removes duplicate calendar records while preserving the server's order.
///
/// IDs are the primary identity. A semantic fingerprint also catches duplicate
/// rows created by repeated calendar imports or syncs, without collapsing
/// events that only share a title but occur at different times.
List<CalendarEvent> deduplicateCalendarEvents(
  Iterable<CalendarEvent> events,
) {
  final seenIds = <String>{};
  final seenFingerprints = <String>{};
  final uniqueEvents = <CalendarEvent>[];

  for (final event in events) {
    if (!seenIds.add(event.id)) {
      continue;
    }

    final fingerprint = _CalendarEventFingerprint.fromEvent(event);
    if (!seenFingerprints.add(fingerprint.value)) {
      continue;
    }

    uniqueEvents.add(event);
  }

  return uniqueEvents;
}

class _CalendarEventFingerprint {
  const _CalendarEventFingerprint(this.value);

  factory _CalendarEventFingerprint.fromEvent(CalendarEvent event) {
    return _CalendarEventFingerprint(
      <Object?>[
        _normalizeText(event.title),
        _normalizeText(event.description),
        event.startAt?.toUtc().microsecondsSinceEpoch,
        event.endAt?.toUtc().microsecondsSinceEpoch,
        event.color?.trim().toLowerCase(),
      ].join('|'),
    );
  }

  final String value;
}

String _normalizeText(String? value) {
  return value?.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase() ?? '';
}
