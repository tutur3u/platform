import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/data/repositories/calendar_series_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _NoApi extends Fake implements ApiClient {
  @override
  void dispose() {}
}

/// A workspace without recurring series, for Calendar page tests that do not
/// exercise them.
class EmptyCalendarSeriesRepository extends CalendarSeriesRepository {
  EmptyCalendarSeriesRepository() : super(apiClient: _NoApi());

  @override
  Future<List<CalendarSeriesOccurrence>> listOccurrences(
    String wsId, {
    required DateTime from,
    required DateTime to,
  }) async => const [];
}
