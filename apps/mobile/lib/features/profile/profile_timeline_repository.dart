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

class ProfileTimelineRepository {
  ProfileTimelineRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

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

  Future<List<ProfileTimelineItem>?> cached(
    String workspaceId,
    String userId,
  ) async {
    final result = await CacheStore.instance.read<List<ProfileTimelineItem>>(
      key: _key(workspaceId, userId),
      decode: _decode,
    );
    return result.data;
  }

  Future<List<ProfileTimelineItem>> refresh(
    String workspaceId,
    String userId,
  ) async {
    final response = await _api.getJson(
      '/api/v1/workspaces/$workspaceId/mobile-activity',
    );
    final items = _decode(response['items']);
    await CacheStore.instance.write(
      key: _key(workspaceId, userId),
      policy: CachePolicies.summary,
      payload: items.map((item) => item.toJson()).toList(),
      tags: ['module:profile', 'workspace:$workspaceId'],
    );
    return items;
  }

  void dispose() => _api.dispose();
}
