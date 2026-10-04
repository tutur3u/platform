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

  int? nextPage(String workspaceId, String userId) =>
      _continuations['$userId:$workspaceId'];

  Future<ProfileTimelineSnapshot> loadMore(
    String workspaceId,
    String userId,
    int page,
  ) async {
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
    final partial = response['partial'] == true;
    if (partial) throw const FormatException('Activity page is incomplete');
    _continuations['$userId:$workspaceId'] = response['nextPage'] as int?;
    return (
      items: _decode(response['items']),
      partial: false,
      limited: response['limited'] == true,
    );
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
    final response = await ApiClient.runForUser(
      userId,
      () => _api.getJson('/api/v1/workspaces/$workspaceId/mobile-activity'),
    );
    _continuations.clear();
    _boundaries.clear();
    if (response['until'] case final String until) {
      _boundaries['$userId:$workspaceId'] = until;
    }
    _continuations['$userId:$workspaceId'] = response['partial'] == true
        ? null
        : response['nextPage'] as int?;
    final items = _decode(response['items']);
    final snapshot = (
      items: items,
      partial: response['partial'] == true,
      limited: response['limited'] == true,
    );
    try {
      await _store.write(
        key: _key(workspaceId, userId),
        policy: CachePolicies.summary,
        payload: {
          'version': 1,
          'items': items.map((item) => item.toJson()).toList(),
          'partial': snapshot.partial,
          'limited': snapshot.limited,
        },
        tags: ['module:profile', 'workspace:$workspaceId'],
      );
    } on Object {
      // A failed snapshot write must not hide activity returned by the API.
    }
    return snapshot;
  }

  void dispose() => _api.dispose();
}
