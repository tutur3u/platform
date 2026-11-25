import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Image types and size the inventory media endpoint accepts.
const Set<String> inventoryImageContentTypes = {
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
};
const int inventoryImageMaxBytes = 8 * 1024 * 1024;

/// Uploads a product image through the inventory media endpoints and
/// returns the read URL the product stores as `avatar_url`.
///
/// The upload URL, headers and storage host come from the server; the app
/// never builds a storage path or host.
Future<String> uploadInventoryProductImage({
  required ApiClient api,
  required String wsId,
  required List<int> bytes,
  required String fileName,
  required String contentType,
  http.Client? httpClient,
}) async {
  if (!inventoryImageContentTypes.contains(contentType) ||
      bytes.isEmpty ||
      bytes.length > inventoryImageMaxBytes) {
    throw const ApiException(message: 'Unsupported image', statusCode: 400);
  }
  final ticket = await api.postJson(InventoryEndpoints.mediaUploadUrl(wsId), {
    'contentType': contentType,
    'filename': fileName,
    'size': bytes.length,
    'target': 'product-featured-image',
  });
  final signedUrl = ticket['signedUrl'];
  final path = ticket['path'];
  final uploadUri = signedUrl is String ? Uri.tryParse(signedUrl.trim()) : null;
  if (uploadUri == null ||
      !{'http', 'https'}.contains(uploadUri.scheme) ||
      uploadUri.host.isEmpty ||
      path is! String ||
      path.isEmpty) {
    throw const ApiException(
      message: 'Image upload unavailable',
      statusCode: 0,
    );
  }
  final extra = ticket['headers'];
  final token = ticket['token'];
  final headers = <String, String>{
    'Content-Type': contentType,
    if (extra is Map<String, dynamic>)
      for (final MapEntry(:key, :value) in extra.entries)
        if (value is String) key: value,
    if (token is String && token.isNotEmpty) 'Authorization': 'Bearer $token',
  };

  final client = httpClient ?? http.Client();
  late http.Response response;
  try {
    response = await client
        .put(uploadUri, headers: headers, body: Uint8List.fromList(bytes))
        .timeout(const Duration(seconds: 60));
  } on SocketException catch (_) {
    throw const ApiException.transport(message: 'Image upload lost');
  } on http.ClientException catch (_) {
    throw const ApiException.transport(message: 'Image upload lost');
  } on TimeoutException catch (_) {
    throw const ApiException.transport(message: 'Image upload timed out');
  } finally {
    if (httpClient == null) client.close();
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw ApiException(
      message: 'Image upload failed',
      statusCode: response.statusCode,
    );
  }

  final read = await api.postJson(InventoryEndpoints.mediaReadUrl(wsId), {
    'path': path,
    if (ticket['provider'] case final String provider) 'provider': provider,
  });
  final readUrl = read['readUrl'];
  if (readUrl is! String || readUrl.isEmpty) {
    throw const ApiException(message: 'Image URL unavailable', statusCode: 0);
  }
  return readUrl;
}
