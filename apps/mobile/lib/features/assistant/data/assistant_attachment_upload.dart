import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_media_optimizer.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

const int _chunkBytes = 64 * 1024;

/// Uploads one composer attachment into the selected chat's own store.
///
/// Native conversations upload through the Chat attachment route, which is the
/// only prefix their send path accepts (`chats/<conversationId>/`). Legacy
/// chats use the AI resource route. There is deliberately no cross-store
/// fallback: a file in the other store would upload, then be dropped from the
/// message. Uploads never enter the offline outbox, so a pending local value
/// can never pose as an uploaded file.
class AssistantAttachmentUploader {
  AssistantAttachmentUploader({
    required ApiClient apiClient,
    required http.Client httpClient,
  }) : _api = apiClient,
       _http = httpClient;

  final ApiClient _api;
  final http.Client _http;

  Future<AssistantAttachment> upload({
    required String wsId,
    required AssistantFilePickerResult file,
    String? chatId,
    void Function(double progress)? onProgress,
  }) async {
    if (file.size > assistantMaxAttachmentBytes) {
      throw const AssistantAttachmentUploadException(
        AssistantAttachmentFailure.tooLarge,
      );
    }
    final route = chatId == null || chatId.isEmpty
        ? null
        : AssistantChatRoute.parse(chatId);
    final bytes = await file.file.readAsBytes();
    final contentType = file.mimeType.isEmpty
        ? 'application/octet-stream'
        : file.mimeType;
    try {
      final _Prepared prepared;
      if (route?.kind == AssistantChatRouteKind.native) {
        final response = await _api.postJson(
          '/api/v1/workspaces/$wsId/chat/conversations/'
          '${route!.conversationId}/attachments/upload-url',
          {
            'filename': file.name,
            'contentType': contentType,
            'sizeBytes': bytes.length,
          },
        );
        final attachment = response['attachment'];
        prepared = _Prepared(
          signedUrl: response['signedUrl'] as String?,
          token: response['token'] as String?,
          headers: response['headers'],
          path: attachment is Map ? attachment['path'] as String? : null,
        );
      } else {
        final response = await _api.postJson('/api/ai/chat/upload-url', {
          'filename': file.name,
          'wsId': wsId,
          'sizeBytes': bytes.length,
          if (route != null) 'chatId': route.storageId,
        });
        prepared = _Prepared(
          signedUrl: response['signedUrl'] as String?,
          token: response['token'] as String?,
          headers: null,
          path: response['path'] as String?,
        );
      }
      final signedUrl = prepared.signedUrl;
      final path = prepared.path;
      if (signedUrl == null || signedUrl.isEmpty || path == null) {
        throw const AssistantAttachmentUploadException(
          AssistantAttachmentFailure.server,
        );
      }
      await _put(
        Uri.parse(signedUrl),
        bytes,
        headers: {
          ...prepared.headerMap,
          'Content-Type': contentType,
          if (prepared.token case final token? when token.isNotEmpty)
            'Authorization': 'Bearer $token',
        },
        onProgress: onProgress,
      );
      return AssistantAttachment(
        id: file.id,
        name: file.name,
        size: bytes.length,
        type: contentType,
        localPath: file.path.isEmpty ? null : file.path,
        storagePath: path,
        uploadState: AssistantAttachmentUploadState.uploaded,
        uploadProgress: 1,
      );
    } on ApiException catch (error) {
      throw AssistantAttachmentUploadException(
        AssistantAttachmentFailure.fromApi(error),
        statusCode: error.statusCode,
      );
    } on SocketException {
      throw const AssistantAttachmentUploadException(
        AssistantAttachmentFailure.network,
      );
    } on http.ClientException {
      throw const AssistantAttachmentUploadException(
        AssistantAttachmentFailure.network,
      );
    } on TimeoutException {
      throw const AssistantAttachmentUploadException(
        AssistantAttachmentFailure.network,
      );
    }
  }

  Future<void> _put(
    Uri url,
    Uint8List bytes, {
    required Map<String, String> headers,
    void Function(double progress)? onProgress,
  }) async {
    final request = http.StreamedRequest('PUT', url)
      ..headers.addAll(headers)
      ..contentLength = bytes.length;
    final response = _http.send(request);
    // A transport failure while the body streams must not surface as an
    // uncaught async error; the await below still receives it.
    unawaited(response.then<void>((_) {}, onError: (Object _) {}));
    // Progress advances as the transport pulls each chunk, not when queued.
    Stream<List<int>> chunks() async* {
      onProgress?.call(0);
      for (var start = 0; start < bytes.length; start += _chunkBytes) {
        final end = math.min(start + _chunkBytes, bytes.length);
        yield Uint8List.sublistView(bytes, start, end);
        onProgress?.call(end / bytes.length);
      }
    }

    await request.sink.addStream(chunks());
    unawaited(request.sink.close());
    final streamed = await response.timeout(const Duration(minutes: 2));
    final status = streamed.statusCode;
    final body = await streamed.stream.bytesToString();
    if (status < 200 || status >= 300) {
      throw ApiException(
        message: body.isEmpty ? 'Upload failed' : body,
        statusCode: status,
      );
    }
  }
}

class _Prepared {
  const _Prepared({
    required this.signedUrl,
    required this.token,
    required this.headers,
    required this.path,
  });

  final String? signedUrl;
  final String? token;
  final Object? headers;
  final String? path;

  Map<String, String> get headerMap => {
    if (headers case final Map<dynamic, dynamic> map)
      for (final entry in map.entries)
        entry.key.toString(): entry.value.toString(),
  };
}
