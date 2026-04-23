import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/sources/api_client.dart';

class CrmRepository {
  CrmRepository({ApiClient? apiClient, http.Client? httpClient})
    : _api = apiClient ?? ApiClient(),
      _http = httpClient ?? http.Client();

  final ApiClient _api;
  final http.Client _http;

  Future<CrmUsersResult> getUsers(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
    List<String> includedGroups = const <String>[],
    List<String> excludedGroups = const <String>[],
    String status = 'active',
    String linkStatus = 'all',
    String requireAttention = 'all',
    String groupMembership = 'all',
    bool withPromotions = false,
  }) async {
    final response = await _api.getJson(
      CrmEndpoints.usersDatabase(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
        includedGroups: includedGroups,
        excludedGroups: excludedGroups,
        status: status,
        linkStatus: linkStatus,
        requireAttention: requireAttention,
        groupMembership: groupMembership,
        withPromotions: withPromotions,
      ),
    );
    return CrmUsersResult.fromJson(response);
  }

  Future<void> createUser(
    String wsId,
    Map<String, dynamic> payload,
  ) async {
    await _api.postJson(CrmEndpoints.users(wsId), payload);
  }

  Future<void> updateUser(
    String wsId,
    String userId,
    Map<String, dynamic> payload,
  ) async {
    await _api.putJson(CrmEndpoints.user(wsId, userId), payload);
  }

  Future<void> deleteUser(String wsId, String userId) async {
    await _api.deleteJson(CrmEndpoints.user(wsId, userId));
  }

  Future<List<CrmGroup>> getGroups(
    String wsId, {
    List<String>? ids,
    int page = 1,
    int pageSize = 200,
  }) async {
    final response = await _api.getJson(
      CrmEndpoints.userGroups(
        wsId,
        ids: ids,
        page: page,
        pageSize: pageSize,
      ),
    );
    return (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(CrmGroup.fromJson)
        .toList(growable: false);
  }

  Future<CrmFeedbackResult> getFeedbacks(
    String wsId, {
    String? query,
    int page = 1,
    int pageSize = 20,
    String requireAttention = 'all',
    String? userId,
    String? groupId,
    String? creatorId,
  }) async {
    final response = await _api.getJson(
      CrmEndpoints.feedbacks(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
        requireAttention: requireAttention,
        userId: userId,
        groupId: groupId,
        creatorId: creatorId,
      ),
    );
    return CrmFeedbackResult.fromJson(response);
  }

  Future<void> createFeedback(
    String wsId, {
    required String userId,
    required String groupId,
    required String content,
    required bool requireAttention,
  }) async {
    await _api.postJson(CrmEndpoints.feedbacks(wsId), {
      'userId': userId,
      'groupId': groupId,
      'content': content,
      'require_attention': requireAttention,
    });
  }

  Future<void> updateFeedback(
    String wsId, {
    required String feedbackId,
    required String content,
    required bool requireAttention,
  }) async {
    await _api.putJson(
      '${CrmEndpoints.feedbacks(wsId)}?feedbackId=$feedbackId',
      {
        'content': content,
        'require_attention': requireAttention,
      },
    );
  }

  Future<void> deleteFeedback(String wsId, {required String feedbackId}) async {
    await _api.deleteJson(
      '${CrmEndpoints.feedbacks(wsId)}?feedbackId=$feedbackId',
    );
  }

  Future<CrmAuditResult> getAuditLogs(
    String wsId, {
    required String start,
    required String end,
    String? eventKind,
    String? source,
    String? affectedUserQuery,
    String? actorQuery,
    int offset = 0,
    int limit = 100,
  }) async {
    final response = await _api.getJson(
      CrmEndpoints.auditLogs(
        wsId,
        start: start,
        end: end,
        eventKind: eventKind,
        source: source,
        affectedUserQuery: affectedUserQuery,
        actorQuery: actorQuery,
        offset: offset,
        limit: limit,
      ),
    );
    return CrmAuditResult.fromJson(response);
  }

  Future<CrmDuplicateDetectionResult> detectDuplicates(String wsId) async {
    final response = await _api.postJson(CrmEndpoints.detectDuplicates(wsId), {
      'triggeredAt': DateTime.now().toIso8601String(),
    });
    return CrmDuplicateDetectionResult.fromJson(response);
  }

  Future<CrmMergeResult> mergeUsers(
    String wsId, {
    required String sourceId,
    required String targetId,
  }) async {
    final response = await _api.postJson(CrmEndpoints.mergeUsers(wsId), {
      'sourceId': sourceId,
      'targetId': targetId,
    });
    return CrmMergeResult.fromJson(response);
  }

  Future<void> bulkImportUsers(
    String wsId,
    List<Map<String, dynamic>> payload,
  ) async {
    await _api.postJson(CrmEndpoints.bulkImport(wsId), payload);
  }

  Future<String> uploadAvatar(
    String wsId, {
    required String fileName,
    required String contentType,
    required Uint8List bytes,
  }) async {
    final response = await _api.postJson(CrmEndpoints.avatar(wsId), {
      'fileName': fileName,
      'contentType': contentType,
    });

    final token = response['token'] as String?;
    final path = response['path'] as String?;

    if (token == null || token.isEmpty || path == null || path.isEmpty) {
      throw const ApiException(
        message: 'Failed to prepare avatar upload',
        statusCode: 0,
      );
    }

    var projectUrl = Env.supabaseUrl.replaceAll(RegExp(r'/$'), '');
    if (projectUrl.contains('localhost')) {
      projectUrl = projectUrl.replaceAll('localhost', '10.0.2.2');
    }
    final uploadResponse = await _http.put(
      Uri.parse('$projectUrl/storage/v1/s3/object/$path?token=$token'),
      headers: {'Content-Type': contentType},
      body: bytes,
    );

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      throw ApiException(
        message: 'Failed to upload avatar',
        statusCode: uploadResponse.statusCode,
      );
    }

    final signed = await _api.getJson(
      '${CrmEndpoints.avatar(wsId)}?path=$path',
    );
    final signedUrl = signed['signedUrl'] as String?;

    if (signedUrl == null || signedUrl.isEmpty) {
      throw const ApiException(
        message: 'Failed to generate avatar URL',
        statusCode: 0,
      );
    }

    return signedUrl;
  }

  void dispose() {
    _api.dispose();
    _http.close();
  }
}
