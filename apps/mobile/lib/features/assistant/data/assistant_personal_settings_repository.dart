import 'dart:async';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_memory_edit.dart';
import 'package:mobile/features/assistant/data/assistant_soul_receipts.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

bool isAssistantSettingsDenial(Object error) =>
    error is ApiException &&
    !error.isVerificationRequired &&
    error.code != 'MFA_REQUIRED' &&
    const [401, 403, 404].contains(error.statusCode);

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
    CacheStore? store,
    String? Function()? currentUserId,
  }) : _api = api ?? ApiClient(expectedUserId: ownerId),
       _store = store ?? CacheStore.instance,
       _currentUserId = currentUserId ?? currentCacheUserId,
       _invalidateSoul =
           invalidateSoul ??
           ((owner) => (store ?? CacheStore.instance).invalidateTags([
             'assistant:metadata',
           ], userId: owner));
  final String ownerId;
  final ApiClient _api;
  final CacheStore _store;
  final String? Function() _currentUserId;
  final Future<void> Function(String) _invalidateSoul;
  int _soulGeneration = 0;
  bool _soulDenied = false;
  String _memoryPath(String workspaceId) =>
      '/api/v1/workspaces/${Uri.encodeComponent(workspaceId)}/ai/memory';

  /// Only confirmed personality is restored; memory and consent stay remote.
  Future<AssistantSoul?> readCachedSoul() async {
    if (_soulDenied || _currentUserId() != ownerId) return null;
    final key = verifiedSoulKey(ownerId);
    final epoch = _store.scopeRevisionFor(key);
    final revision = _store.resourceRevisionFor(key);
    final generation = _soulGeneration;
    final cached = await _store.read<AssistantSoul>(
      key: key,
      decode: (json) => decodeVerifiedSoul(json, ownerId),
    );
    if (_soulDenied ||
        _currentUserId() != ownerId ||
        _store.scopeRevisionFor(key) != epoch ||
        _store.resourceRevisionFor(key) != revision ||
        generation != _soulGeneration) {
      return null;
    }
    return cached.data;
  }

  Future<void> _bestEffortCache(Future<void> Function() operation) async {
    try {
      await operation();
    } on Object {
      // Persistence must not hide a network receipt or its authorization error.
    }
  }

  Future<AssistantSoul> _requestSoul(
    Future<Map<String, dynamic>> Function() request, {
    bool invalidate = false,
  }) async {
    final generation = ++_soulGeneration;
    final key = verifiedSoulKey(ownerId);
    final epoch = _store.scopeRevisionFor(key);
    final revision = _store.resourceRevisionFor(key);
    final actor = _currentUserId();
    if (actor != null && actor != ownerId) {
      throw StateError('Personal settings owner changed');
    }
    final cacheAdmitted = actor == ownerId;
    void checkScope() {
      if (generation != _soulGeneration ||
          (cacheAdmitted &&
              (_currentUserId() != ownerId ||
                  _store.scopeRevisionFor(key) != epoch))) {
        throw StateError('Personal settings soul scope changed');
      }
    }

    try {
      final response = await ApiClient.runForUser(ownerId, request);
      checkScope();
      if (_store.resourceRevisionFor(key) != revision) {
        throw StateError('Personal settings soul changed');
      }
      final soul = decodeSoulReceipt(response['soul'], ownerId);
      if (invalidate) await _invalidateSoul(ownerId);
      checkScope();
      _soulDenied = false;
      if (cacheAdmitted) {
        final publicationRevision = _store.resourceRevisionFor(key);
        unawaited(
          _bestEffortCache(
            () => _store.write(
              key: key,
              policy: CachePolicies.metadata,
              payload: verifiedSoulPayload(soul, ownerId),
              tags: const ['assistant:metadata', 'module:assistant'],
              expectedRevision: publicationRevision,
              checkScope: checkScope,
            ),
          ),
        );
      }
      return soul;
    } on ApiException catch (error) {
      checkScope();
      if (isAssistantSettingsDenial(error) &&
          cacheAdmitted &&
          _store.resourceRevisionFor(key) == revision) {
        _soulDenied = true;
        unawaited(
          _bestEffortCache(() => _store.remove(key, checkScope: checkScope)),
        );
      }
      rethrow;
    }
  }

  Future<AssistantPersonalSettingsSnapshot> load(String workspaceId) async {
    final soulRequest = _requestSoul(() => _api.getJson(assistantSoulPath));
    final memoryRequest =
        Future.wait([
          _api.getJson('${_memoryPath(workspaceId)}/settings?product=mira'),
          _api.getJson('${_memoryPath(workspaceId)}/items?product=mira'),
        ]).then<List<Map<String, dynamic>>?>(
          (value) => value,
          onError: (Object _) => null,
        );
    final soul = await soulRequest;
    final memory = await memoryRequest;
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

  Future<AssistantSoul> saveSoul(AssistantSoul soul) => _requestSoul(() async {
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
    return response;
  }, invalidate: true);

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

  Future<EditableAssistantMemory> readMemoryForEdit(
    String workspaceId,
    String id,
  ) async {
    final response = await _api.getJson(
      '${_memoryPath(workspaceId)}/items/${Uri.encodeComponent(id)}?product=mira',
    );
    if (response['memory'] is! Map<String, dynamic>) {
      throw const FormatException('Memory revision unavailable');
    }
    return EditableAssistantMemory.fromJson(
      response['memory'] as Map<String, dynamic>,
      expectedId: id,
    );
  }

  Future<AssistantMemoryEditReceipt> editMemory(
    String workspaceId,
    String id, {
    required String value,
    required String revision,
  }) async {
    final response = await _api.patchJson(
      '${_memoryPath(workspaceId)}/items/${Uri.encodeComponent(id)}?product=mira',
      {'value': value, 'revision': revision},
    );
    return AssistantMemoryEditReceipt.fromJson(
      response,
      expectedId: id,
      previousRevision: revision,
      submittedText: value,
    );
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
