import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

/// Device-only encrypted history. No remote repository or upload path exists.
/// The bounded current conversation is independent for every actor/workspace/model.
class AssistantLocalHistory {
  AssistantLocalHistory({CacheStore? cache})
    : _cache = cache ?? CacheStore.instance;
  final CacheStore _cache;
  static const _policy = CachePolicy(
    staleAfter: Duration(days: 365),
    expireAfter: Duration(days: 365),
    refreshOnResume: false,
    refreshOnReconnect: false,
    allowBackgroundRefresh: false,
  );

  CacheKey _key(String actor, String workspace, String model) => CacheKey(
    namespace: 'assistant.local_conversation',
    userId: actor,
    workspaceId: workspace,
    params: {'model': model},
  );

  Future<List<AssistantMessage>> load({
    required String actor,
    required String workspace,
    required String model,
    required bool Function() isScopeCurrent,
  }) async {
    if (!isScopeCurrent()) return const [];
    final read = await _cache.read<List<AssistantMessage>>(
      key: _key(actor, workspace, model),
      decode: (payload) {
        if (payload is! List) {
          throw const FormatException('Invalid local history');
        }
        return payload
            .map((row) {
              if (row is! Map<String, dynamic>) {
                throw const FormatException('Invalid local history row');
              }
              final message = AssistantMessage.fromJson(row);
              if (message.role != 'user' && message.role != 'assistant') {
                throw const FormatException('Invalid local history role');
              }
              if (message.parts.any((part) => part.type != 'text')) {
                throw const FormatException('Invalid local history part');
              }
              return message;
            })
            .toList(growable: false);
      },
    );
    return isScopeCurrent()
        ? boundedLocalHistory(read.data ?? const [])
        : const [];
  }

  Future<void> save({
    required String actor,
    required String workspace,
    required String model,
    required List<AssistantMessage> messages,
    required bool Function() isScopeCurrent,
  }) => _cache.write(
    key: _key(actor, workspace, model),
    policy: _policy,
    payload: boundedLocalHistory(messages).map((row) => row.toJson()).toList(),
    requirePublication: true,
    checkScope: () {
      if (!isScopeCurrent()) throw StateError('Local history scope changed');
    },
  );

  Future<void> clear({
    required String actor,
    required String workspace,
    required String model,
    required bool Function() isScopeCurrent,
  }) => _cache.remove(
    _key(actor, workspace, model),
    checkScope: () {
      if (!isScopeCurrent()) throw StateError('Local history scope changed');
    },
  );
}

List<AssistantMessage> boundedLocalHistory(List<AssistantMessage> messages) {
  var remaining = 64000;
  final selected = <AssistantMessage>[];
  for (final message in messages.reversed.take(32)) {
    final length = message.parts.fold<int>(
      0,
      (total, part) => total + (part.text?.length ?? 0),
    );
    if (length > remaining) break;
    remaining -= length;
    selected.insert(0, message);
  }
  return selected;
}
