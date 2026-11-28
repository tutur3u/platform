part of 'chat_repository.dart';

/// Whether [error] is the send refusal for a direct conversation where
/// either side blocked the other.
bool isChatBlockedError(Object error) =>
    error is ApiException &&
    error.statusCode == 403 &&
    (error.message == 'chat_blocked' || error.code == 'chat_blocked');

/// User blocks and reports. These calls need the server's answer, so they
/// are never queued offline or served from the cache.
extension ChatRepositorySafety on ChatRepository {
  String _blocksPath(String wsId) => '/api/v1/workspaces/$wsId/chat/blocks';

  Future<List<ChatBlockedUser>> listBlocks(String wsId) async {
    final response = await _apiClient.getJson(_blocksPath(wsId));
    return (response['blocks'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ChatBlockedUser.fromJson)
        .where((block) => block.userId.isNotEmpty)
        .toList(growable: false);
  }

  Future<void> blockUser(String wsId, String userId) async {
    await _apiClient.postJson(_blocksPath(wsId), {'userId': userId});
  }

  Future<void> unblockUser(String wsId, String userId) async {
    await _apiClient.deleteJson(
      '${_blocksPath(wsId)}/${Uri.encodeComponent(userId)}',
    );
  }

  Future<ChatReportReceipt> submitReport(
    String wsId,
    ChatReportDraft draft,
  ) async {
    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/chat/reports',
      draft.toJson(),
    );
    return (
      reportId: response['reportId']?.toString() ?? '',
      blocked: response['blocked'] == true,
    );
  }
}
