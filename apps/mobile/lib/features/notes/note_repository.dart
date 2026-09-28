import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/notes/note_lock_crypto.dart';

class NoteRecord {
  const NoteRecord({
    required this.id,
    required this.title,
    required this.content,
    required this.updatedAt,
    required this.archived,
  });

  factory NoteRecord.fromJson(Map<String, dynamic> json) => NoteRecord(
    id: json['id'] as String? ?? '',
    title: json['title'] as String? ?? '',
    content:
        (json['content'] as Map?)?.cast<String, dynamic>() ??
        const <String, dynamic>{'type': 'doc', 'content': <Object>[]},
    updatedAt: DateTime.tryParse(json['updated_at'] as String? ?? ''),
    archived: json['archived'] == true,
  );

  final String id;
  final String title;
  final Map<String, dynamic> content;
  final DateTime? updatedAt;
  final bool archived;

  bool get locked => lockedNoteEnvelope(content) != null;

  String get preview {
    if (locked) return '';
    final parts = <String>[];
    void visit(Object? node) {
      if (node is Map<String, dynamic>) {
        final text = node['text'];
        if (text is String) parts.add(text);
        final children = node['content'];
        if (children is List<Object?>) {
          children.forEach(visit);
        }
      }
    }

    visit(content);
    return parts.join(' ').trim();
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'content': content,
    'updated_at': updatedAt?.toIso8601String(),
    'archived': archived,
  };
}

class NoteRepository {
  NoteRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;
  static const CachePolicy _policy = CachePolicies.moduleData;

  CacheKey _key(String wsId, {bool archived = false}) => CacheKey(
    namespace: archived ? 'notes.archive' : 'notes.list',
    userId: currentCacheUserId(),
    workspaceId: wsId,
  );

  static List<NoteRecord> _decode(Object? value) =>
      (value as List<Object?>? ?? <Object?>[])
          .whereType<Map<String, dynamic>>()
          .map((item) => NoteRecord.fromJson(item.cast<String, dynamic>()))
          .toList(growable: false);

  Future<List<NoteRecord>> _withPending(
    String wsId,
    List<NoteRecord> notes, {
    required bool archived,
  }) async {
    final byId = {for (final note in notes) note.id: note};
    final alternate = await CacheStore.instance.read<List<NoteRecord>>(
      key: _key(wsId, archived: !archived),
      decode: _decode,
    );
    final alternateById = {
      for (final note in alternate.data ?? const <NoteRecord>[]) note.id: note,
    };
    final pending = await OfflineMutationQueue.instance.listPending();
    for (final mutation in pending.where(
      (item) => item.feature == 'notes' && item.workspaceId == wsId,
    )) {
      final payload = mutation.payload;
      if (mutation.method == 'POST' && payload != null) {
        final note = NoteRecord.fromJson({
          'id': payload['id'],
          'title': payload['title'],
          'content': payload['content'],
          'archived': false,
          'updated_at': mutation.createdAt.toIso8601String(),
        });
        if (!archived) byId[note.id] = note;
      } else if (mutation.method == 'PUT') {
        final id = mutation.entityId;
        final previous = byId[id] ?? alternateById[id];
        if (previous == null || payload == null) continue;
        final note = NoteRecord.fromJson({
          ...previous.toJson(),
          ...payload,
          'updated_at': mutation.createdAt.toIso8601String(),
        });
        if (note.archived == archived) {
          byId[note.id] = note;
        } else {
          byId.remove(id);
        }
      } else if (mutation.method == 'DELETE') {
        byId.remove(mutation.entityId);
      }
    }
    return byId.values.toList(growable: false);
  }

  Future<void> _persistPendingSnapshot(String wsId) async {
    final inbox = await cached(wsId);
    final archive = await cached(wsId, archived: true);
    await CacheStore.instance.remove(_key(wsId));
    await CacheStore.instance.remove(_key(wsId, archived: true));
    for (final (archived, notes) in <(bool, List<NoteRecord>)>[
      (false, inbox),
      (true, archive),
    ]) {
      await CacheStore.instance.write(
        key: _key(wsId, archived: archived),
        policy: _policy,
        payload: notes.map((note) => note.toJson()).toList(),
        tags: ['module:notes', 'workspace:$wsId'],
      );
    }
  }

  Future<List<NoteRecord>> cached(String wsId, {bool archived = false}) async {
    final result = await CacheStore.instance.read<List<NoteRecord>>(
      key: _key(wsId, archived: archived),
      decode: _decode,
    );
    return await _withPending(
      wsId,
      result.data ?? const [],
      archived: archived,
    );
  }

  Future<List<NoteRecord>> refresh(String wsId, {bool archived = false}) async {
    final response = await _api.getJsonList(
      '/api/v1/workspaces/$wsId/notes?archived=$archived',
    );
    final notes = await _withPending(
      wsId,
      _decode(response),
      archived: archived,
    );
    await CacheStore.instance.write(
      key: _key(wsId, archived: archived),
      policy: _policy,
      payload: notes.map((note) => note.toJson()).toList(),
      tags: ['module:notes', 'workspace:$wsId'],
    );
    return notes;
  }

  Future<NoteRecord> create(String wsId) async {
    final path = '/api/v1/workspaces/$wsId/notes';
    final id = newLocalMutationId();
    final payload = <String, dynamic>{
      'id': id,
      'title': '',
      'content': {'type': 'doc', 'content': <Object>[]},
    };
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'notes',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: id,
      replaySafe: true,
    )) {
      await _persistPendingSnapshot(wsId);
      return NoteRecord.fromJson({
        ...payload,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      });
    }
    try {
      final response = await _api.postJson(path, payload);
      return NoteRecord.fromJson(response);
    } on ApiException catch (error) {
      if (await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
        error: error,
        feature: 'notes',
        method: 'POST',
        path: path,
        workspaceId: wsId,
        payload: payload,
        entityId: id,
        replaySafe: true,
      )) {
        await _persistPendingSnapshot(wsId);
        return NoteRecord.fromJson({
          ...payload,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        });
      }
      rethrow;
    }
  }

  Future<NoteRecord> update(
    String wsId,
    NoteRecord note, {
    String? title,
    Map<String, dynamic>? content,
    bool? archived,
  }) async {
    final path = '/api/v1/workspaces/$wsId/notes/${note.id}';
    final payload = <String, dynamic>{
      if (title != null) 'title': title,
      if (content != null) 'content': content,
      if (archived != null) 'archived': archived,
    };
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'notes',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: note.id,
    )) {
      await _persistPendingSnapshot(wsId);
      return NoteRecord.fromJson({
        ...note.toJson(),
        ...payload,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      });
    }
    // Remove the earlier plaintext snapshot before a lock can be persisted.
    // CacheStore.remove also invalidates in-flight list writes for this key.
    await CacheStore.instance.remove(_key(wsId));
    await CacheStore.instance.remove(_key(wsId, archived: true));
    final response = await _api.putJson(path, payload);
    return NoteRecord.fromJson(response);
  }

  Future<String> wrapRecoveryKey(
    String wsId,
    String noteId,
    String secret,
  ) async {
    final result = await _api.postJson(
      '/api/v1/workspaces/$wsId/notes/$noteId/recovery',
      {'secret': secret},
    );
    return result['wrapped'] as String;
  }

  Future<String> recoverKeyWithPasskey(String wsId, String noteId) async {
    final result = await _api.getJson(
      '/api/v1/workspaces/$wsId/notes/$noteId/recovery',
    );
    return result['secret'] as String;
  }

  Future<void> approveKeyTransfer(
    String wsId,
    String noteId,
    String id,
    String sealed,
  ) async {
    await _api.postJson('/api/v1/workspaces/$wsId/notes/$noteId/transfer', {
      'action': 'approve',
      'id': id,
      'sealed': sealed,
    });
  }

  Future<void> delete(String wsId, String noteId) async {
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'notes',
      method: 'DELETE',
      path: '/api/v1/workspaces/$wsId/notes/$noteId',
      workspaceId: wsId,
      entityId: noteId,
    )) {
      await _persistPendingSnapshot(wsId);
      return;
    }
    await CacheStore.instance.remove(_key(wsId));
    await CacheStore.instance.remove(_key(wsId, archived: true));
    await _api.deleteJson('/api/v1/workspaces/$wsId/notes/$noteId');
  }

  void dispose() => _api.dispose();
}
