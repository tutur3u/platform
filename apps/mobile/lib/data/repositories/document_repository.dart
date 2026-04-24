import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/sources/api_client.dart';

class DocumentRepository {
  DocumentRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<WorkspaceDocumentsPage> listDocuments(
    String wsId, {
    String? search,
    int limit = 50,
    int offset = 0,
  }) async {
    final response = await _api.getJson(
      DocumentsEndpoints.documents(
        wsId,
        search: search,
        limit: limit,
        offset: offset,
      ),
    );
    return WorkspaceDocumentsPage.fromJson(response);
  }

  Future<WorkspaceDocument> getDocument(
    String wsId,
    String documentId,
  ) async {
    final response = await _api.getJson(
      DocumentsEndpoints.document(wsId, documentId),
    );
    return WorkspaceDocument.fromJson(
      response['data'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<String> createDocument(
    String wsId, {
    required String name,
    String content = '',
    bool isPublic = false,
  }) async {
    final response = await _api.postJson(DocumentsEndpoints.documents(wsId), {
      'name': name,
      'content': content,
      'is_public': isPublic,
    });
    return response['id'] as String? ?? '';
  }

  Future<void> updateDocument(
    String wsId,
    String documentId, {
    String? name,
    String? content,
    bool? isPublic,
  }) async {
    await _api.patchJson(DocumentsEndpoints.document(wsId, documentId), {
      if (name != null) 'name': name,
      if (content != null) 'content': content,
      if (isPublic != null) 'is_public': isPublic,
    });
  }

  Future<void> deleteDocument(String wsId, String documentId) async {
    await _api.deleteJson(DocumentsEndpoints.document(wsId, documentId));
  }

  void dispose() {
    _api.dispose();
  }
}
