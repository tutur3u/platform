part of 'calendar_cubit.dart';

extension CalendarProviderColorActions on CalendarCubit {
  Future<GoogleCalendarColorOptions?> getGoogleColorOptions(
    String wsId,
    CalendarEvent event,
  ) async {
    if (isClosed ||
        _wsId != wsId ||
        event.provider != 'google' ||
        event.sourceCalendarId == null) {
      return null;
    }
    final userId = currentCacheUserId();
    try {
      final options = await _repo.getGoogleColorOptionsForEvent(wsId, event);
      if (isClosed || _wsId != wsId || userId != currentCacheUserId()) {
        return null;
      }
      return options;
    } on Exception {
      return null;
    }
  }

  Future<void> updateProviderColor(
    String wsId,
    String eventId,
    GoogleCalendarColorChoice choice,
  ) async {
    if (isClosed || _wsId != wsId) {
      return;
    }
    final userId = currentCacheUserId();
    try {
      final event = await _repo.updateProviderColor(wsId, eventId, choice);
      if (isClosed || _wsId != wsId || userId != currentCacheUserId()) {
        return;
      }
      if (event != null) {
        _publishProviderState(
          _storeAndReturn(
            state.copyWith(
              events: state.events
                  .map((item) => item.id == eventId ? event : item)
                  .toList(),
            ),
          ),
        );
      }
    } on Exception catch (error) {
      if (isClosed || _wsId != wsId || userId != currentCacheUserId()) {
        return;
      }
      _publishProviderState(state.copyWith(error: error.toString()));
    }
  }
}
