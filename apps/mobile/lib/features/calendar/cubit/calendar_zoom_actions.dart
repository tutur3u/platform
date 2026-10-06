part of 'calendar_cubit.dart';

class _CalendarZoomScopeChanged extends StateError {
  _CalendarZoomScopeChanged() : super('Calendar scope changed.');
}

extension _CalendarZoomActions on CalendarCubit {
  Future<void> _setTimelineZoom(
    double value,
    String? expectedUserId,
    String? expectedWorkspaceId,
    (Object, int) expectedScope,
  ) async {
    final wsId = _wsId;
    final actor = _userId;

    bool isCurrent() =>
        !isClosed &&
        wsId != null &&
        wsId == expectedWorkspaceId &&
        actor == expectedUserId &&
        actor == currentCacheUserId() &&
        wsId == _wsId &&
        actor == _userId &&
        expectedScope == timelineZoomScope;
    if (!isCurrent()) return;
    final next = _storeAndReturn(
      state.copyWith(timelineZoom: calendarTimelineZoom(value)),
    );
    _publishProviderState(next);
    try {
      await _cacheStore
          .write(
            key: CalendarCubit._cacheKey(wsId!),
            policy: CalendarCubit._cachePolicy,
            payload: _stateToCacheJson(next),
            checkScope: () {
              if (!isCurrent()) throw _CalendarZoomScopeChanged();
            },
            tags: [
              CalendarCubit._cacheTag,
              'workspace:$wsId',
              'module:calendar',
            ],
          )
          .onError<_CalendarZoomScopeChanged>((_, _) {
            // Only our obsolete scope lease is an expected cancellation.
          });
    } on Exception {
      // Zoom remains usable when local preference storage is unavailable.
    }
  }
}
