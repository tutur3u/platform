import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/cms/cms_models.dart';
import 'package:mobile/data/sources/api_client.dart';

class CmsRepository {
  CmsRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<CmsSummary> getSummary(String wsId) async {
    final response = await _api.getJson(CmsEndpoints.summary(wsId));
    return CmsSummary.fromJson(response);
  }

  Future<List<CmsCollection>> listCollections(String wsId) async {
    final response = await _api.getJsonList(CmsEndpoints.collections(wsId));
    return response
        .whereType<Map<String, dynamic>>()
        .map(CmsCollection.fromJson)
        .toList(growable: false);
  }

  Future<CmsCollection> createCollection(
    String wsId, {
    required String title,
    required String slug,
    required String collectionType,
    String? description,
  }) async {
    final response = await _api.postJson(CmsEndpoints.collections(wsId), {
      'title': title,
      'slug': slug,
      'collection_type': collectionType,
      'description': description,
      'config': <String, dynamic>{},
    });
    return CmsCollection.fromJson(response);
  }

  Future<CmsCollection> updateCollection(
    String wsId,
    String collectionId, {
    required String title,
    required String slug,
    required String collectionType,
    required bool isEnabled,
    String? description,
  }) async {
    final response = await _api.patchJson(
      CmsEndpoints.collection(wsId, collectionId),
      {
        'title': title,
        'slug': slug,
        'collection_type': collectionType,
        'description': description,
        'is_enabled': isEnabled,
      },
    );
    return CmsCollection.fromJson(response);
  }

  Future<void> deleteCollection(String wsId, String collectionId) async {
    await _api.deleteJson(CmsEndpoints.collection(wsId, collectionId));
  }

  Future<List<CmsEntry>> listEntries(
    String wsId, {
    String? collectionId,
  }) async {
    final response = await _api.getJsonList(
      CmsEndpoints.entries(wsId, collectionId: collectionId),
    );
    return response
        .whereType<Map<String, dynamic>>()
        .map(CmsEntry.fromJson)
        .toList(growable: false);
  }

  Future<CmsEntry> createEntry(
    String wsId, {
    required String collectionId,
    required String title,
    required String slug,
    required String status,
    String? subtitle,
    String? summary,
  }) async {
    final response = await _api.postJson(CmsEndpoints.entries(wsId), {
      'collection_id': collectionId,
      'title': title,
      'slug': slug,
      'status': status,
      'subtitle': subtitle,
      'summary': summary,
      'metadata': <String, dynamic>{},
      'profile_data': <String, dynamic>{},
    });
    return CmsEntry.fromJson(response);
  }

  Future<CmsEntry> updateEntry(
    String wsId,
    String entryId, {
    required String title,
    required String slug,
    required String status,
    String? subtitle,
    String? summary,
  }) async {
    final response = await _api.patchJson(CmsEndpoints.entry(wsId, entryId), {
      'title': title,
      'slug': slug,
      'status': status,
      'subtitle': subtitle,
      'summary': summary,
    });
    return CmsEntry.fromJson(response);
  }

  Future<void> deleteEntry(String wsId, String entryId) async {
    await _api.deleteJson(CmsEndpoints.entry(wsId, entryId));
  }

  void dispose() {
    _api.dispose();
  }
}
