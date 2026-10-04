import 'dart:async';

import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';

class ProfileTimelineItem {
  const ProfileTimelineItem({
    required this.id,
    required this.type,
    required this.createdAt,
    required this.scope,
    this.title,
    this.boardId,
  });

  factory ProfileTimelineItem.fromJson(Map<String, dynamic> json) =>
      ProfileTimelineItem(
        id: json['id'] as String,
        type: json['type'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
        scope: json['scope'] as String,
        title: json['title'] as String?,
        boardId: json['boardId'] as String?,
      );

  final String id;
  final String type;
  final DateTime createdAt;
  final String scope;
  final String? title;
  final String? boardId;

  Map<String, Object?> toJson() => {
    'id': id,
    'type': type,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'scope': scope,
    'title': title,
    'boardId': boardId,
  };
}

typedef ProfileTimelineSnapshot = ({
  List<ProfileTimelineItem> items,
  bool partial,
  bool limited,
});

class ProfileTimelineRepository {
  ProfileTimelineRepository({ApiClient? apiClient, CacheStore? cacheStore})
    : _api = apiClient ?? ApiClient(),
      _store = cacheStore ?? CacheStore.instance;

  final ApiClient _api;
  final CacheStore _store;
  final _continuations = <String, int?>{};
  final _boundaries = <String, String>{};
  final _snapshots = <String, ProfileTimelineSnapshot>{};
  int _generation = 0;
  Future<void> _writes = Future<void>.value();

  int? nextPage(String workspaceId, String userId) =>
      _continuations['$userId:$workspaceId'];

  Future<ProfileTimelineSnapshot> loadMore(
    String workspaceId,
    String userId,
    int page,
  ) async {
    final generation = _generation;
    final until = _boundaries['$userId:$workspaceId'];
    if (until == null) throw const FormatException('Activity session expired');
    final path = Uri(
      path: '/api/v1/workspaces/$workspaceId/mobile-activity',
      queryParameters: {'page': '$page', 'until': until},
    ).toString();
    final response = await ApiClient.runForUser(
      userId,
      () => _api.getJson(path),
    );
    _checkSession(userId, generation);
    if (_boundaries['$userId:$workspaceId'] != until) {
      throw const FormatException('Activity session changed');
    }
    final partial = response['partial'] == true;
    if (partial) throw const FormatException('Activity page is incomplete');
    final fresh = (
      items: _decode(response['items']),
      partial: false,
      limited: response['limited'] == true,
    );
    final previous = _snapshots['$userId:$workspaceId'];
    final merged = (
      items: _merge(previous?.items ?? [], fresh.items),
      partial: previous?.partial ?? false,
      limited: fresh.limited,
    );
    await _persist(workspaceId, userId, merged, generation);
    _checkSession(userId, generation);
    _snapshots['$userId:$workspaceId'] = merged;
    _continuations['$userId:$workspaceId'] = response['nextPage'] as int?;
    return fresh;
  }

  CacheKey _key(String workspaceId, String userId) => CacheKey(
    namespace: 'profile.timeline',
    workspaceId: workspaceId,
    userId: userId,
  );

  List<ProfileTimelineItem> _decode(Object? value) =>
      (value as List<Object?>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ProfileTimelineItem.fromJson)
          .toList(growable: false);

  ProfileTimelineSnapshot _decodeSnapshot(Object? value) {
    // Older encrypted snapshots contain only the item list.
    if (value is List) {
      return (items: _decode(value), partial: false, limited: false);
    }
    if (value is! Map<String, dynamic> || value['version'] != 1) {
      throw const FormatException('Unsupported profile timeline snapshot');
    }
    return (
      items: _decode(value['items']),
      partial: value['partial'] == true,
      limited: value['limited'] == true,
    );
  }

  Future<ProfileTimelineSnapshot?> cached(
    String workspaceId,
    String userId,
  ) async {
    final result = await _store.read<ProfileTimelineSnapshot>(
      key: _key(workspaceId, userId),
      decode: _decodeSnapshot,
    );
    return result.data;
  }

  Future<ProfileTimelineSnapshot> refresh(
    String workspaceId,
    String userId,
  ) async {
    final generation = ++_generation;
    final response = await ApiClient.runForUser(
      userId,
      () => _api.getJson('/api/v1/workspaces/$workspaceId/mobile-activity'),
    );
    _checkSession(userId, generation);
    ProfileTimelineSnapshot? previous;
    if (response['partial'] == true) {
      try {
        previous = await cached(workspaceId, userId);
      } on Object {
        // A damaged snapshot does not block the successful provider rows.
      }
    }
    _checkSession(userId, generation);
    _continuations.clear();
    _boundaries.clear();
    _snapshots.clear();
    if (response['until'] case final String until) {
      _boundaries['$userId:$workspaceId'] = until;
    }
    _continuations['$userId:$workspaceId'] = response['partial'] == true
        ? null
        : response['nextPage'] as int?;
    const sourceTypes = {
      'tasks': 'task',
      'transactions': 'transaction',
      'notes': 'note',
      'events': 'calendar',
    };
    final failures = response['failedSources'];
    final failedTypes = failures is List
        ? failures
              .map((source) => sourceTypes[source])
              .whereType<String>()
              .toSet()
        : sourceTypes.values.toSet();
    final snapshot = (
      items: _merge(
        previous?.items
                .where((item) => failedTypes.contains(item.type))
                .toList() ??
            [],
        _decode(response['items']),
      ),
      partial: response['partial'] == true,
      limited: response['limited'] == true || (previous?.limited ?? false),
    );
    await _persist(workspaceId, userId, snapshot, generation);
    _checkSession(userId, generation);
    _snapshots['$userId:$workspaceId'] = snapshot;
    return snapshot;
  }

  List<ProfileTimelineItem> _merge(
    List<ProfileTimelineItem> previous,
    List<ProfileTimelineItem> fresh,
  ) => {
    for (final item in [...previous, ...fresh]) '${item.type}:${item.id}': item,
  }.values.toList();

  Future<void> _persist(
    String workspaceId,
    String userId,
    ProfileTimelineSnapshot snapshot,
    int generation,
  ) async {
    final predecessor = _writes;
    final done = Completer<void>();
    _writes = done.future;
    await predecessor;
    try {
      _checkSession(userId, generation);
      try {
        await _store.write(
          key: _key(workspaceId, userId),
          policy: CachePolicies.summary,
          payload: {
            'version': 1,
            'items': snapshot.items.map((item) => item.toJson()).toList(),
            'partial': snapshot.partial,
            'limited': snapshot.limited,
          },
          tags: ['module:profile', 'workspace:$workspaceId'],
        );
      } on Object {
        // A failed snapshot write must not hide activity returned by the API.
      }
    } finally {
      done.complete();
    }
  }

  void _checkSession(String userId, int generation) {
    _api.checkUser(userId);
    if (generation != _generation) {
      throw const FormatException('Activity session changed');
    }
  }

  void dispose() => _api.dispose();
}
