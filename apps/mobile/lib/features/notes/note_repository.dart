import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';

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

  String get preview {
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

  CacheKey _key(String wsId) => CacheKey(
    namespace: 'notes.list',
    userId: currentCacheUserId(),
    workspaceId: wsId,
  );

  static List<NoteRecord> _decode(Object? value) =>
      (value as List<Object?>? ?? <Object?>[])
          .whereType<Map<String, dynamic>>()
          .map((item) => NoteRecord.fromJson(item.cast<String, dynamic>()))
          .toList(growable: false);

  Future<List<NoteRecord>> cached(String wsId) async {
    final result = await CacheStore.instance.read<List<NoteRecord>>(
      key: _key(wsId),
      decode: _decode,
    );
    return result.data ?? const [];
  }

  Future<List<NoteRecord>> refresh(String wsId) async {
    final response = await _api.getJsonList('/api/v1/workspaces/$wsId/notes');
    final notes = _decode(response);
    await CacheStore.instance.write(
      key: _key(wsId),
      policy: _policy,
      payload: notes.map((note) => note.toJson()).toList(),
      tags: ['module:notes', 'workspace:$wsId'],
    );
    return notes;
  }

  Future<NoteRecord> create(String wsId) async {
    final response = await _api.postJson('/api/v1/workspaces/$wsId/notes', {
      'title': '',
      'content': {'type': 'doc', 'content': <Object>[]},
    });
    return NoteRecord.fromJson(response);
  }

  Future<NoteRecord> update(
    String wsId,
    NoteRecord note, {
    String? title,
    Map<String, dynamic>? content,
    bool? archived,
  }) async {
    final response = await _api
        .putJson('/api/v1/workspaces/$wsId/notes/${note.id}', {
          if (title != null) 'title': title,
          if (content != null) 'content': content,
          if (archived != null) 'archived': archived,
        });
    return NoteRecord.fromJson(response);
  }

  Future<void> delete(String wsId, String noteId) async {
    await _api.deleteJson('/api/v1/workspaces/$wsId/notes/$noteId');
  }

  void dispose() => _api.dispose();
}
