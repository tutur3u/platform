import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

class AssistantMemoryItem {
  const AssistantMemoryItem({required this.id, required this.text});
  factory AssistantMemoryItem.fromJson(Map<String, dynamic> json) =>
      AssistantMemoryItem(
        id: json['id'] as String,
        text:
            (json['value'] ??
                    json['content'] ??
                    json['summary'] ??
                    json['title'] ??
                    '')
                as String,
      );
  final String id;
  final String text;
}

class AssistantPersonalSettingsSnapshot {
  const AssistantPersonalSettingsSnapshot({
    required this.soul,
    required this.memoryEnabled,
    required this.memories,
    this.products = const {},
  });
  final AssistantSoul soul;
  final bool? memoryEnabled;
  final List<AssistantMemoryItem> memories;
  final Map<String, bool> products;
}

/// Existing server APIs own authorization and memory consent. No local replica
/// or offline replay of privacy controls is created by this editor.
class AssistantPersonalSettingsRepository {
  AssistantPersonalSettingsRepository({
    required this.ownerId,
    ApiClient? api,
    Future<void> Function(String)? invalidateSoul,
  }) : _api = api ?? ApiClient(expectedUserId: ownerId),
       _invalidateSoul =
           invalidateSoul ??
           ((owner) => CacheStore.instance.invalidateTags([
             'assistant:metadata',
           ], userId: owner));
  final String ownerId;
  final ApiClient _api;
  final Future<void> Function(String) _invalidateSoul;
  String _memoryPath(String workspaceId) =>
      '/api/v1/workspaces/${Uri.encodeComponent(workspaceId)}/ai/memory';

  Future<AssistantPersonalSettingsSnapshot> load(String workspaceId) async {
    final soulRequest = _api.getJson('/api/v1/mira/soul');
    final memoryRequest =
        Future.wait([
          _api.getJson('${_memoryPath(workspaceId)}/settings?product=mira'),
          _api.getJson('${_memoryPath(workspaceId)}/items?product=mira'),
        ]).then<List<Map<String, dynamic>>?>(
          (value) => value,
          onError: (Object _) => null,
        );
    final soulResponse = await soulRequest;
    final memory = await memoryRequest;
    final soul = AssistantSoul.fromJson(
      soulResponse['soul'] as Map<String, dynamic>?,
    );
    if (memory == null || memory[0]['enabled'] is! bool) {
      return AssistantPersonalSettingsSnapshot(
        soul: soul,
        memoryEnabled: null,
        memories: const [],
      );
    }
    return AssistantPersonalSettingsSnapshot(
      soul: soul,
      memoryEnabled: memory[0]['enabled'] as bool,
      products: Map<String, bool>.from(
        memory[0]['products'] as Map<String, dynamic>,
      ),
      memories: (memory[1]['items'] as List<dynamic>)
          .map(
            (item) =>
                AssistantMemoryItem.fromJson(item as Map<String, dynamic>),
          )
          .toList(),
    );
  }

  Future<AssistantSoul> saveSoul(AssistantSoul soul) async {
    final response = await _api.patchJson(
      '/api/v1/mira/soul',
      {
        'name': soul.name,
        'tone': soul.tone,
        'personality': soul.personality,
        'boundaries': soul.boundaries,
        'chat_tone': soul.chatTone,
      }..removeWhere((key, value) => value == null),
    );
    if (response['soul'] is! Map<String, dynamic>) {
      throw StateError('Personality update not confirmed');
    }
    final saved = AssistantSoul.fromJson(
      response['soul'] as Map<String, dynamic>,
    );
    await _invalidateSoul(ownerId);
    return saved;
  }

  Future<bool> setMemoryEnabled(
    String workspaceId, {
    required bool enabled,
    required Map<String, bool> products,
  }) async {
    final response = await _api.patchJson(
      '${_memoryPath(workspaceId)}/settings',
      {'enabled': enabled, 'products': products},
    );
    if (response['enabled'] is! bool) {
      throw StateError('Consent update not confirmed');
    }
    return response['enabled'] as bool;
  }

  Future<void> deleteMemory(String workspaceId, String id) async {
    final response = await _api.deleteJson(
      '${_memoryPath(workspaceId)}/items/${Uri.encodeComponent(id)}?product=mira',
    );
    if (response['deleted'] != true) throw StateError('Deletion not confirmed');
  }

  Future<Map<String, dynamic>> exportMemories(String workspaceId) =>
      _api.postJson('${_memoryPath(workspaceId)}/export?product=mira', {});
}
