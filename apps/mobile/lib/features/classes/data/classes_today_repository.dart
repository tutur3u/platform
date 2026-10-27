import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/classes/data/class_session.dart';

/// Which classes Today lists. Hiding classes is a presentation filter, not
/// a security boundary: the server still decides what the actor may see.
enum ClassScope { mine, all }

/// Teachers start on their own classes when the source can tell them apart.
const ClassScope defaultClassScope = ClassScope.mine;

class ClassesTodaySnapshot extends Equatable {
  const ClassesTodaySnapshot({
    required this.sessions,
    this.scopeSupported = false,
  });

  factory ClassesTodaySnapshot.fromJson(Object? json) {
    final map = json is Map ? json : const <String, Object?>{};
    final rows = map['sessions'];
    return ClassesTodaySnapshot(
      sessions: [
        if (rows is List)
          for (final row in rows) ?ClassSession.fromJson(row),
      ],
      scopeSupported: map['scopeSupported'] == true,
    );
  }

  final List<ClassSession> sessions;

  /// Whether the source can filter to the actor's own classes.
  final bool scopeSupported;

  Map<String, Object?> toJson() => {
    'sessions': [for (final session in sessions) session.toJson()],
    'scopeSupported': scopeSupported,
  };

  @override
  List<Object?> get props => [sessions, scopeSupported];
}

/// The data behind Home's "Today's classes". The sessions-list source ships
/// first; the consolidated Today endpoint replaces it behind this interface.
abstract interface class ClassesTodayRepository {
  ClassesTodaySnapshot? peek({
    required String userId,
    required String wsId,
    required DateTime day,
  });

  Future<ClassesTodaySnapshot> fetch({
    required String userId,
    required String wsId,
    required DateTime day,
    required ClassScope scope,
  });

  /// Drops the stored snapshot, for example after the server denies access.
  Future<void> forget({
    required String userId,
    required String wsId,
    required DateTime day,
  });
}

/// The server's answer decides access: `view_user_groups` is enforced by the
/// API, so a denial is authoritative while any other failure is transient.
/// A Turnstile challenge is a 403 too, but it says nothing about access.
bool isClassesAccessDenied(Object error) =>
    error is ApiException &&
    !error.isVerificationRequired &&
    const {401, 403, 404}.contains(error.statusCode);

/// Lists the day's sessions from `GET …/user-groups/sessions`, which the
/// server gates on `view_user_groups`. It cannot tell which classes the
/// actor teaches.
class SessionsClassesTodayRepository implements ClassesTodayRepository {
  SessionsClassesTodayRepository({ApiClient? apiClient, CacheStore? store})
    : _apiOverride = apiClient,
      _storeOverride = store;

  // Created on first use: General mode never builds these clients.
  final ApiClient? _apiOverride;
  final CacheStore? _storeOverride;
  late final ApiClient _api = _apiOverride ?? ApiClient();
  late final CacheStore _store = _storeOverride ?? CacheStore.instance;

  static String sessionsPath(String wsId, DateTime day) {
    final start = DateTime(day.year, day.month, day.day);
    final end = DateTime(day.year, day.month, day.day + 1);
    final query = Uri(
      queryParameters: {
        'from': start.toUtc().toIso8601String(),
        'to': end
            .subtract(const Duration(milliseconds: 1))
            .toUtc()
            .toIso8601String(),
      },
    ).query;
    return '/api/v1/workspaces/${Uri.encodeComponent(wsId)}'
        '/user-groups/sessions?$query';
  }

  static CacheKey _key(String userId, String wsId, DateTime day) => CacheKey(
    namespace: 'classes.today',
    userId: userId,
    workspaceId: wsId,
    params: {'day': '${day.year}-${day.month}-${day.day}'},
  );

  @override
  ClassesTodaySnapshot? peek({
    required String userId,
    required String wsId,
    required DateTime day,
  }) => _store
      .peek(key: _key(userId, wsId, day), decode: ClassesTodaySnapshot.fromJson)
      .data;

  @override
  Future<ClassesTodaySnapshot> fetch({
    required String userId,
    required String wsId,
    required DateTime day,
    required ClassScope scope,
  }) async {
    final data = await _api.getJson(sessionsPath(wsId, day));
    final rows = data['data'];
    final snapshot = ClassesTodaySnapshot(
      sessions: [
        if (rows is List)
          for (final row in rows) ?ClassSession.fromJson(row),
      ],
    );
    try {
      await _store.write(
        key: _key(userId, wsId, day),
        policy: CachePolicies.summary,
        payload: snapshot.toJson(),
        tags: ['workspace:$wsId', 'module:classes'],
      );
    } on Object {
      // A cache failure never discards a fresh server response.
    }
    return snapshot;
  }

  @override
  Future<void> forget({
    required String userId,
    required String wsId,
    required DateTime day,
  }) async {
    try {
      await _store.remove(_key(userId, wsId, day));
    } on Object {
      // The next denial retries the removal.
    }
  }
}
