import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/repositories/calendar_pending_overlay.dart';

void main() {
  final now = DateTime.utc(2026, 9, 28);
  PendingMutationRecord mutation(
    String method,
    String id, {
    Map<String, dynamic>? payload,
  }) => PendingMutationRecord(
    id: '$method-$id',
    feature: 'calendar',
    method: method,
    path: '/api/v1/workspaces/ws_1/calendar/events/$id',
    createdAt: now,
    userId: 'user_1',
    workspaceId: 'ws_1',
    payload: payload,
    optimisticPatch: {'entityId': id},
  );

  test('pending create appears in range and is scoped to workspace', () {
    final pending = [
      mutation(
        'POST',
        'local_1',
        payload: {
          'title': 'Offline meeting',
          'start_at': '2026-09-28T09:00:00.000Z',
          'end_at': '2026-09-28T10:00:00.000Z',
        },
      ),
    ];
    final visible = overlayPendingCalendarEvents(
      'ws_1',
      const [],
      pending,
      start: now,
      end: now.add(const Duration(days: 1)),
    );
    expect(visible.single.id, 'local_1');
    expect(visible.single.title, 'Offline meeting');
    expect(overlayPendingCalendarEvents('ws_2', const [], pending), isEmpty);
  });

  test('pending update moves an event out of the selected range', () {
    final original = CalendarEvent.fromJson(const {
      'id': 'event_1',
      'title': 'Plan',
      'start_at': '2026-09-28T09:00:00.000Z',
      'end_at': '2026-09-28T10:00:00.000Z',
    });
    final result = overlayPendingCalendarEvents(
      'ws_1',
      [original],
      [
        mutation(
          'PUT',
          'event_1',
          payload: {
            'start_at': '2026-09-30T09:00:00.000Z',
            'end_at': '2026-09-30T10:00:00.000Z',
          },
        ),
      ],
      start: now,
      end: now.add(const Duration(days: 1)),
    );
    expect(result, isEmpty);
  });

  test('pending delete hides a cached event', () {
    const event = CalendarEvent(id: 'event_1', title: 'Plan');
    expect(
      overlayPendingCalendarEvents(
        'ws_1',
        const [event],
        [mutation('DELETE', 'event_1')],
      ),
      isEmpty,
    );
  });
}
