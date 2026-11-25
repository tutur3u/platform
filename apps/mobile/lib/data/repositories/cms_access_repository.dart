import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Decides whether the CMS app is shown for a workspace.
///
/// Like web, CMS exists only when the workspace has an enabled
/// external-project binding with a canonical project; otherwise the API
/// answers 404 "External project studio unavailable for this workspace".
/// Mobile probes the summary endpoint, which also requires the manage grant:
/// every mobile CMS action (summary, collections, entry edits) needs it, so a
/// plain 403 hides the app rather than opening a page the actor cannot use.
/// Web additionally admits edit/publish-only members to its studio.
class CmsAccessRepository {
  CmsAccessRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  static const CachePolicy _cachePolicy = CachePolicies.metadata;
  static const _cacheTag = 'cms:access';

  final ApiClient _api;

  CacheKey _cacheKey(String wsId) => CacheKey(
    namespace: 'cms.access',
    userId: currentCacheUserId(),
    workspaceId: wsId,
  );

  static bool _decodeEnabled(Object? json) {
    if (json is Map<String, dynamic> && json['enabled'] is bool) {
      return json['enabled'] as bool;
    }
    throw FormatException('Invalid CMS access payload: $json');
  }

  /// Whether [error] means the workspace has no CMS for this actor, as
  /// opposed to a transient or re-authentication failure.
  static bool isUnavailableError(ApiException error) {
    if (error.statusCode == 404) return true;
    return error.statusCode == 403 &&
        error.code != 'MFA_REQUIRED' &&
        !error.isVerificationRequired;
  }

  Future<CacheReadResult<bool>> readCachedCmsAccess(String wsId) async {
    final actor = currentCacheUserId();
    if (actor == null) {
      return const CacheReadResult<bool>(state: CacheEntryState.missing);
    }
    final result = await CacheStore.instance.read<bool>(
      key: _cacheKey(wsId),
      decode: _decodeEnabled,
    );
    return currentCacheUserId() == actor
        ? result
        : const CacheReadResult<bool>(state: CacheEntryState.missing);
  }

  /// Resolves access from the network. [forceRefresh] bypasses a fresh cached
  /// answer, so a page that just saw the studio vanish gets the server's word.
  /// Throws when the actor changes mid-read or the cache yields no answer,
  /// rather than reporting a guessed "disabled".
  Future<bool> isCmsEnabled(String wsId, {bool forceRefresh = false}) async {
    final actor = currentCacheUserId();
    if (actor == null) throw StateError('CMS access read without an actor');
    final result = await CacheStore.instance.prefetch<bool>(
      key: _cacheKey(wsId),
      policy: _cachePolicy,
      decode: _decodeEnabled,
      forceRefresh: forceRefresh,
      fetch: () async {
        var enabled = true;
        try {
          await _api.getJson(CmsEndpoints.summary(wsId));
        } on ApiException catch (error) {
          if (!isUnavailableError(error)) rethrow;
          enabled = false;
        }
        if (currentCacheUserId() != actor) {
          throw StateError('CMS access actor changed');
        }
        return <String, dynamic>{'enabled': enabled};
      },
      tags: const [_cacheTag],
    );
    final enabled = result.data;
    if (currentCacheUserId() != actor || enabled == null) {
      throw StateError('CMS access unresolved');
    }
    return enabled;
  }
}
