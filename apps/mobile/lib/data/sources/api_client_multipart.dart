part of 'api_client.dart';

extension _ApiClientMultipart on ApiClient {
  Future<http.StreamedResponse> _sendMultipart(
    String method,
    String path, {
    required Map<String, String>? fields,
    required List<ApiMultipartFile> files,
    required bool requiresAuth,
    required String accept,
    required bool followRedirects,
    bool Function()? active,
  }) async {
    final url = _url(path);

    return await _performStreamedRequest(() async {
      final userId = requiresAuth ? _auth.currentUser?.id : null;
      final request = http.MultipartRequest(method, url)
        ..followRedirects = followRedirects
        ..headers.addAll(
          await _getHeaders(
            path: path,
            accept: accept,
            requiresAuth: requiresAuth,
          ),
        );

      if (fields != null) {
        request.fields.addAll(fields);
      }

      for (final file in files) {
        request.files.add(
          file.bytes != null
              ? http.MultipartFile.fromBytes(
                  file.field,
                  file.bytes!,
                  filename: file.filename,
                  contentType: file.contentType,
                )
              : await http.MultipartFile.fromPath(
                  file.field,
                  file.filePath!,
                  filename: file.filename,
                  contentType: file.contentType,
                ),
        );
      }

      if (requiresAuth) _checkRequestUser(userId);
      if (active != null && !active()) {
        throw const ApiException(
          message: 'Request scope changed',
          statusCode: 0,
        );
      }
      return await _client.send(request).timeout(_requestTimeout);
    }, requiresAuth: requiresAuth);
  }
}
