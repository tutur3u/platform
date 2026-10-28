import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Asks Web whether the signed-in user may see Mastermind. The server picks
/// the access rule (apps/docs/platform/features/mobile-mastermind.mdx#rollout),
/// so a store build never decides it on its own.
class MastermindAccessRepository {
  MastermindAccessRepository({
    required String? Function() userId,
    ApiClient? apiClient,
  }) : _userId = userId,
       _api = apiClient ?? ApiClient();

  static const accessPath = '/api/v1/mastermind/access';

  final String? Function() _userId;
  final ApiClient _api;

  CacheKey _key(String userId) =>
      CacheKey(namespace: 'mastermind.access', userId: userId);

  static bool _decode(Object? json) {
    final enabled = json is Map ? json['enabled'] : null;
    if (enabled is! bool) {
      throw const FormatException('Invalid Mastermind access payload');
    }
    return enabled;
  }

  /// Always asks the server when online. Only a transport failure falls back
  /// to this user's last answer; anything else is rethrown.
  Future<bool> isEnabled() async {
    final userId = _userId();
    if (userId == null) return false;
    final key = _key(userId);
    try {
      final enabled = _decode(await _api.getJson(accessPath));
      if (_userId() != userId) return false;
      try {
        await CacheStore.instance.write(
          key: key,
          policy: CachePolicies.metadata,
          payload: {'enabled': enabled},
        );
      } on Object {
        // A disk failure does not discard a fresh server answer.
      }
      return enabled;
    } on Object catch (error) {
      if (error is ApiException &&
          (error.statusCode == 401 || error.statusCode == 403)) {
        await CacheStore.instance.remove(key);
      }
      if (!isOfflineTransportFailure(error)) rethrow;
      final cached = await CacheStore.instance.read<bool>(
        key: key,
        decode: _decode,
      );
      final enabled = cached.data;
      if (enabled == null || _userId() != userId) rethrow;
      return enabled;
    }
  }
}
