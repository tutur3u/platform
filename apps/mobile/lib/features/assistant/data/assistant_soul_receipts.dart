import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/models/assistant_soul_snapshot.dart';

const assistantSoulPath = '/api/v1/mira/soul';

CacheKey verifiedSoulKey(String actor) => CacheKey(
  namespace: 'assistant.soul.verified.v1',
  userId: actor,
  locale: currentCacheLocaleTag(),
);

AssistantSoul decodeSoulReceipt(Object? receipt, String actor) {
  if (receipt is! Map<String, dynamic> ||
      receipt['name'] is! String ||
      (receipt['name'] as String).length > 50 ||
      (receipt['user_id'] != null && receipt['user_id'] != actor) ||
      const [
        'tone',
        'personality',
        'boundaries',
        'vibe',
        'push_tone',
        'chat_tone',
      ].any((field) => receipt[field] != null && receipt[field] is! String)) {
    throw const FormatException('Assistant soul receipt not confirmed');
  }
  return AssistantSoul.fromJson(receipt);
}

Map<String, dynamic> verifiedSoulPayload(AssistantSoul soul, String actor) => {
  'schema': 1,
  'ownerId': actor,
  'soul': soul.toJson(),
};

AssistantSoul decodeVerifiedSoul(Object? json, String actor) {
  if (json is! Map || json['schema'] != 1 || json['ownerId'] != actor) {
    throw const FormatException('Invalid verified assistant soul snapshot');
  }
  return decodeSoulReceipt(json['soul'], actor);
}

Future<List<AssistantNameIntent>> readAssistantNameIntents(
  OfflineMutationQueue queue,
  String actor,
  void Function() checkScope,
) async {
  checkScope();
  final pending = await queue.listPending();
  checkScope();
  return [
    for (final item in pending)
      if (item.userId == actor &&
          item.feature == 'assistant' &&
          item.workspaceId == 'personal' &&
          item.method == 'PATCH' &&
          item.path == assistantSoulPath &&
          item.payload?['name'] is String)
        AssistantNameIntent(
          id: item.id,
          name: item.payload!['name'] as String,
          status: item.status,
          createdAt: item.createdAt,
        ),
  ];
}
