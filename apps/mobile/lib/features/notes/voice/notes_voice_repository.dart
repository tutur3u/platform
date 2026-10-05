import 'dart:typed_data';

import 'package:http_parser/http_parser.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/notes/voice/notes_voice_document.dart';
import 'package:mobile/features/notes/voice/notes_voice_job.dart';

class NotesVoiceRepository {
  NotesVoiceRepository({
    ApiClient? api,
    CacheStore? cache,
    String? Function()? actor,
  }) : _api = api ?? ApiClient(),
       _cache = cache ?? CacheStore.instance,
       _actor = actor ?? currentCacheUserId;
  final ApiClient _api;
  final CacheStore _cache;
  final String? Function() _actor;
  int _scopeRevision = 0;
  void invalidateScope() => _scopeRevision++;
  void _guardScope(String actor, int scope) {
    _guard(actor);
    if (scope != _scopeRevision) {
      throw const ApiException(
        message: 'Voice scope changed',
        statusCode: 0,
        failureKind: ApiFailureKind.session,
      );
    }
  }

  CacheKey _key(String actor, String ws) =>
      CacheKey(namespace: 'notes.voice.latest', userId: actor, workspaceId: ws);
  void _guard(String actor) {
    if (_actor() != actor) {
      throw const ApiException(
        message: 'Voice account changed',
        statusCode: 0,
        failureKind: ApiFailureKind.session,
      );
    }
  }

  String _path(String ws, [String? id]) =>
      '/api/v1/workspaces/${Uri.encodeComponent(ws)}/notes/voice-jobs'
      '${id == null ? '' : '/${Uri.encodeComponent(id)}'}';
  Future<NotesVoiceJob?> cached(String actor, String ws) async {
    final scope = _scopeRevision;
    _guardScope(actor, scope);
    final read = await _cache.read<NotesVoiceJob>(
      key: _key(actor, ws),
      decode: (value) =>
          NotesVoiceJob.fromJson((value! as Map).cast<String, dynamic>()),
    );
    _guardScope(actor, scope);
    return read.data;
  }

  Future<NotesVoiceJob> _publish(
    String actor,
    String ws,
    Map<String, dynamic> json,
    int scope,
  ) async {
    _guardScope(actor, scope);
    final job = NotesVoiceJob.fromJson(json);
    if (job.workspaceId != ws) {
      throw const ApiException(
        message: 'Voice workspace mismatch',
        statusCode: 0,
        failureKind: ApiFailureKind.response,
      );
    }
    await _cache.write(
      key: _key(actor, ws),
      policy: CachePolicies.detail,
      checkScope: () => _guardScope(actor, scope),
      payload: job.toJson(),
      tags: ['module:notes', 'workspace:$ws'],
    );
    _guardScope(actor, scope);
    return job;
  }

  Future<NotesVoiceJob> submit(
    String actor,
    String ws, {
    required String requestId,
    required Uint8List audio,
    required String timezone,
    int? expectedRevision,
  }) async {
    final scope = _scopeRevision;
    _guardScope(actor, scope);
    // Persist only the intent before dispatch; navigation can recover status.
    if (expectedRevision == null) {
      await _publish(
        actor,
        ws,
        NotesVoiceJob(
          id: requestId,
          workspaceId: ws,
          status: 'pending',
          revision: 1,
        ).toJson(),
        scope,
      );
    }
    _guardScope(actor, scope);
    late final Map<String, dynamic> json;
    try {
      json = await ApiClient.runForUser(
        actor,
        () => _api.sendMultipart(
          'POST',
          _path(ws),
          fields: {
            'requestId': requestId,
            'timezone': timezone,
            if (expectedRevision != null)
              'expectedRevision': '$expectedRevision',
          },
          files: [
            ApiMultipartFile.bytes(
              field: 'audio',
              bytes: audio,
              filename: 'voice-note.wav',
              contentType: MediaType('audio', 'wav'),
            ),
          ],
        ),
      );
    } on ApiException catch (error) {
      _guardScope(actor, scope);
      if ({401, 403}.contains(error.statusCode) &&
          !error.isVerificationRequired) {
        await _cache.remove(_key(actor, ws));
      }
      rethrow;
    }
    if (json['id'] != requestId) {
      throw const ApiException(
        message: 'Voice intent mismatch',
        statusCode: 0,
        failureKind: ApiFailureKind.response,
      );
    }
    return await _publish(actor, ws, json, scope);
  }

  Future<NotesVoiceJob?> refresh(String actor, String ws, String id) async {
    final scope = _scopeRevision;
    _guardScope(actor, scope);
    try {
      final json = await ApiClient.runForUser(
        actor,
        () => _api.getJson(_path(ws, id)),
      );
      if (json['id'] != id) {
        throw const ApiException(
          message: 'Voice intent mismatch',
          statusCode: 0,
          failureKind: ApiFailureKind.response,
        );
      }
      return await _publish(actor, ws, json, scope);
    } on ApiException catch (error) {
      _guardScope(actor, scope);
      if ({401, 403, 404}.contains(error.statusCode) &&
          !error.isVerificationRequired) {
        await _cache.remove(_key(actor, ws));
      }
      rethrow;
    }
  }

  Future<void> delete(String actor, String ws, String id) async {
    final scope = _scopeRevision;
    _guardScope(actor, scope);
    await ApiClient.runForUser(actor, () => _api.deleteJson(_path(ws, id)));
    _guardScope(actor, scope);
    await _cache.remove(_key(actor, ws));
  }

  Future<void> saveReviewed(
    String actor,
    String ws,
    NotesVoiceJob job,
    String untitled,
  ) async {
    final scope = _scopeRevision;
    _guardScope(actor, scope);
    if (!job.canSave) {
      throw StateError('Voice result is not ready');
    }
    await ApiClient.runForUser(
      actor,
      () =>
          _api.postJson('/api/v1/workspaces/${Uri.encodeComponent(ws)}/notes', {
            'id': job.id,
            'title':
                job.artifact?['title'] is String &&
                    (job.artifact!['title'] as String).trim().isNotEmpty
                ? job.artifact!['title']
                : untitled,
            'content': notesVoiceDocument(job),
          }),
    );
    _guardScope(actor, scope);
    await _cache.invalidateTags(
      ['module:notes'],
      userId: actor,
      workspaceId: ws,
    );
  }

  void dispose() => _api.dispose();
}
