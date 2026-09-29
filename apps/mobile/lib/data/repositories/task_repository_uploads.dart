part of 'task_repository.dart';

extension TaskRepositoryUploads on TaskRepository {
  String _filenameFromPath(String path) {
    final normalized = path.replaceAll(RegExp(r'\\'), '/');
    final parts = normalized.split('/');
    final last = parts.isNotEmpty ? parts.last.trim() : '';
    if (last.isNotEmpty) return last;
    return 'task-image-${DateTime.now().millisecondsSinceEpoch}.jpg';
  }

  Future<String> uploadTaskDescriptionImage({
    required String wsId,
    required String localFilePath,
    String? taskId,
  }) async {
    final filename = _filenameFromPath(localFilePath);
    final bytes = await File(localFilePath).readAsBytes();
    final contentType =
        lookupMimeType(localFilePath) ?? 'application/octet-stream';
    final placeholder = 'offline-task-image-${newLocalMutationId()}';
    return await queueOrSendValue<String>(
      feature: 'tasks',
      method: 'TASK_DESCRIPTION_IMAGE_UPLOAD',
      path: '/api/v1/workspaces/$wsId/tasks/upload-url',
      workspaceId: wsId,
      entityId: placeholder,
      payload: {
        'filename': filename,
        'contentType': contentType,
        'taskId': taskId,
        'bytes': base64Encode(bytes),
      },
      pendingValue: (_) => placeholder,
      send: () => deliverTaskDescriptionImage(
        api: _apiClient,
        httpClient: _httpClient,
        workspaceId: wsId,
        filename: filename,
        contentType: contentType,
        bytes: bytes,
        taskId: taskId,
      ),
    );
  }
}
