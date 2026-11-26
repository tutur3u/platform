import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/data/sources/api_client.dart';

/// The server rejects occurrence reads wider than 400 days.
const calendarSeriesMaxRangeDays = 400;

/// Native recurring series on the Calendar API. Writes never use the offline
/// mutation queue: each carries the revision it was read at, so a replay
/// after reconnecting could overwrite newer changes.
class CalendarSeriesRepository {
  CalendarSeriesRepository({
    ApiClient? apiClient,
    String? Function()? currentUserId,
    Future<bool> Function()? isOnline,
  }) : _api = apiClient ?? ApiClient(),
       _owner = currentUserId ?? currentCacheUserId,
       _isOnline = isOnline ?? hasNetworkConnection;

  final ApiClient _api;
  final String? Function() _owner;
  final Future<bool> Function() _isOnline;

  static String _path(String wsId, [String? seriesId]) =>
      '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/calendar/series'
      '${seriesId == null ? '' : '/${Uri.encodeComponent(seriesId)}'}';

  void Function() _ownerFence() {
    final userId = _owner();
    return () {
      if (_owner() != userId) {
        throw const ApiException(
          message: 'Calendar account changed.',
          statusCode: 401,
        );
      }
    };
  }

  static List<CalendarSeriesOccurrence> _decode(Object? payload) =>
      (payload as List<Object?>? ?? const [])
          .whereType<Map<Object?, Object?>>()
          .map((row) {
            try {
              return CalendarSeriesOccurrence.fromJson(
                Map<String, dynamic>.from(row),
              );
            } on Object {
              return null;
            }
          })
          .whereType<CalendarSeriesOccurrence>()
          .toList(growable: false);

  /// Occurrences overlapping `[from, to)`, which must span at most
  /// [calendarSeriesMaxRangeDays]. A transport failure returns the last
  /// stored result for the same range; denial removes stored results.
  Future<List<CalendarSeriesOccurrence>> listOccurrences(
    String wsId, {
    required DateTime from,
    required DateTime to,
  }) async {
    final checkOwner = _ownerFence();
    final query = Uri(
      queryParameters: {
        'from': from.toUtc().toIso8601String(),
        'to': to.toUtc().toIso8601String(),
        'limit': '1000',
      },
    ).query;
    final key = CacheKey(
      namespace: 'calendar.series.occurrences',
      userId: _owner(),
      workspaceId: wsId,
      params: {'query': query},
    );
    try {
      final response = await _api.getJson('${_path(wsId)}?$query');
      checkOwner();
      final rows = response['data'] as List<Object?>? ?? const [];
      await CacheStore.instance.write(
        key: key,
        checkScope: checkOwner,
        policy: CachePolicies.moduleData,
        payload: rows,
        tags: ['module:calendar', 'workspace:$wsId'],
      );
      return _decode(rows);
    } on ApiException catch (error) {
      checkOwner();
      if (error.statusCode == 401 ||
          (error.statusCode == 403 && !error.isVerificationRequired)) {
        try {
          await CacheStore.instance.clearNamespacePrefix(
            prefix: 'calendar.series.',
            workspaceId: wsId,
            userId: _owner(),
          );
        } on Exception {
          // Keep the authorization failure visible if storage is unavailable.
        }
        rethrow;
      }
      if (!isOfflineTransportFailure(error)) rethrow;
      final retained = await CacheStore.instance.read<Object?>(
        key: key,
        decode: (value) => value,
      );
      checkOwner();
      if (!retained.hasValue) rethrow;
      return _decode(retained.data);
    }
  }

  Future<NativeCalendarSeries> getSeries(String wsId, String seriesId) async {
    final checkOwner = _ownerFence();
    final response = await _api.getJson(_path(wsId, seriesId));
    checkOwner();
    return NativeCalendarSeries.fromJson(response);
  }

  Future<void> _requireConnection() async {
    if (!await _isOnline()) {
      throw const ApiException.transport(message: 'Offline');
    }
  }

  Future<void> createSeries(
    String wsId, {
    required String requestId,
    required CalendarRecurrenceRule rule,
    required CalendarRecurrenceAnchor anchor,
    required Map<String, dynamic> event,
  }) async {
    final checkOwner = _ownerFence();
    await _requireConnection();
    checkOwner();
    await _api.postJson(_path(wsId), {
      'requestId': requestId,
      'rule': rule.toJson(),
      'anchor': anchor.toJson(),
      'event': event,
    });
    await _invalidate(wsId);
  }

  /// Scoped update (`PUT`) or delete (`DELETE`). Absent [rule] and [anchor]
  /// keep what the server derives for the scope, which preserves retained
  /// exceptions when only event details change.
  Future<void> mutateSeries(
    String wsId,
    String seriesId, {
    required bool delete,
    required String requestId,
    required int expectedRevision,
    required CalendarRecurrenceScope scope,
    required String originalStartLocal,
    Map<String, dynamic>? event,
    CalendarRecurrenceRule? rule,
    CalendarRecurrenceAnchor? anchor,
  }) async {
    final checkOwner = _ownerFence();
    await _requireConnection();
    checkOwner();
    final body = <String, dynamic>{
      'requestId': requestId,
      'expectedRevision': expectedRevision,
      'scope': scope.wire,
      'originalStartLocal': originalStartLocal,
      if (!delete && event != null) 'event': event,
      if (!delete &&
          rule != null &&
          scope != CalendarRecurrenceScope.occurrence)
        'rule': rule.toJson(),
      if (!delete && anchor != null) 'anchor': anchor.toJson(),
    };
    final path = _path(wsId, seriesId);
    if (delete) {
      await _api.deleteJson(path, body: body);
    } else {
      await _api.putJson(path, body);
    }
    await _invalidate(wsId);
  }

  Future<void> _invalidate(String wsId) async {
    try {
      await CacheStore.instance.invalidateTags({
        'module:calendar',
        'workspace:$wsId',
      });
    } on Exception {
      // The caller reloads occurrences from the network next.
    }
  }

  void dispose() => _api.dispose();
}
