import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

/// Reuse Calendar's authenticated native gateway, including event decryption.
Future<AssistantCalendarInsight> loadAssistantCalendarInsight(
  ApiClient api,
  String wsId,
) async {
  final now = DateTime.now().toUtc();
  final query = Uri(
    queryParameters: {
      'start_at': now.toIso8601String(),
      'end_at': now.add(const Duration(days: 7)).toIso8601String(),
    },
  ).query;
  final response = await api.getJson(
    '/api/v1/workspaces/$wsId/calendar/events?$query',
  );
  final allEvents = (response['data'] as List<dynamic>? ?? const [])
      .whereType<Map<String, dynamic>>()
      .toList(growable: false);
  final events = allEvents
      .take(25)
      .map(AssistantCalendarEvent.fromJson)
      .toList(growable: false);
  return AssistantCalendarInsight(events: events, total: allEvents.length);
}
