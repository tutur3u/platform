import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Repository for calendar event operations.
class CalendarRepository {
  Future<List<CalendarEvent>> getEvents(
    String wsId, {
    DateTime? start,
    DateTime? end,
  }) async {
    var query = supabase
        .from('workspace_calendar_events')
        .select()
        .eq('ws_id', wsId);

    if (start != null) {
      query = query.or(
        'end_at.gte.${start.toUtc().toIso8601String()},end_at.is.null',
      );
    }
    if (end != null) {
      query = query.lte('start_at', end.toUtc().toIso8601String());
    }

    final response = await query.order('start_at');

    return (response as List<dynamic>)
        .map((e) => CalendarEvent.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<CalendarEvent?> getEventById(String eventId) async {
    final response = await supabase
        .from('workspace_calendar_events')
        .select()
        .eq('id', eventId)
        .maybeSingle();

    if (response == null) return null;
    return CalendarEvent.fromJson(response);
  }

  Future<CalendarEvent> createEvent(
    String wsId,
    Map<String, dynamic> data,
  ) async {
    final response = await supabase
        .from('workspace_calendar_events')
        .insert({...data, 'ws_id': wsId})
        .select()
        .single();

    return CalendarEvent.fromJson(response);
  }

  Future<void> updateEvent(
    String eventId,
    Map<String, dynamic> data,
  ) async {
    await supabase
        .from('workspace_calendar_events')
        .update(data)
        .eq('id', eventId);
  }

  Future<void> deleteEvent(String eventId) async {
    await supabase.from('workspace_calendar_events').delete().eq('id', eventId);
  }
}
