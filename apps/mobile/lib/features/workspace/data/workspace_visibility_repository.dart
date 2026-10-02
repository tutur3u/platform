import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Owner-scoped UI preference; never changes canonical workspace membership.
class WorkspaceVisibilityRepository {
  WorkspaceVisibilityRepository({
    ApiClient? api,
    CacheStore? cache,
    String? Function()? currentActor,
  }) : _api = api ?? ApiClient(),
       _cache = cache ?? CacheStore.instance,
       _currentActor = currentActor ?? currentCacheUserId;

  final ApiClient _api;
  final CacheStore _cache;
  final String? Function() _currentActor;
  static const _path = '/api/v1/users/me/hidden-workspaces';

  CacheKey _key(String actor) => CacheKey(
    namespace: 'workspace.hidden',
    userId: actor,
    workspaceId: 'personal',
  );

  void _assertActor(String actor) {
    if (_currentActor() != actor) throw StateError('Workspace account changed');
  }

  List<String> _decode(Object? data) =>
      (data! as List).whereType<String>().toList(growable: false);

  Future<CacheReadResult<List<String>>> readCached(String actor) async {
    _assertActor(actor);
    final result = await _cache.read<List<String>>(
      key: _key(actor),
      decode: _decode,
    );
    _assertActor(actor);
    return result;
  }

  Future<List<String>> refresh(String actor) async {
    _assertActor(actor);
    final data = await _api.getJson(
      '$_path?expectedActorId=${Uri.encodeQueryComponent(actor)}',
    );
    _assertActor(actor);
    return _decode(data['hiddenWorkspaceIds']);
  }

  Future<void> saveCached(String actor, List<String> ids) async {
    _assertActor(actor);
    await _cache.write(
      key: _key(actor),
      policy: CachePolicies.metadata,
      payload: ids,
      tags: const ['workspace:hidden'],
    );
    _assertActor(actor);
  }

  Future<void> update(
    String actor,
    String workspaceId, {
    required bool hidden,
  }) async {
    _assertActor(actor);
    await _api.putJson(_path, {
      'workspaceId': workspaceId,
      'hidden': hidden,
      'expectedActorId': actor,
    });
    _assertActor(actor);
  }
}
