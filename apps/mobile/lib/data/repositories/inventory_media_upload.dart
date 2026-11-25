import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/inventory_media_urls.dart';
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
/// returns the stable share URL the product stores as `avatar_url`.
///
/// The upload URL, headers and storage host come from the server. The read
/// URL request runs only so the server validates the finished upload; a
/// signed read URL expires, so the product keeps the sign-on-read share URL
/// for the uploaded path instead.
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
      uploadUri.scheme != 'https' ||
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
  try {
    var response = await _put(client, uploadUri, headers, bytes);
    // Some storage providers reject the declared type on presigned uploads;
    // retry once without it, as the web uploader does.
    if (response.statusCode >= 400 && response.statusCode < 500) {
      response = await _put(
        client,
        uploadUri,
        {...headers}..remove('Content-Type'),
        bytes,
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        message: 'Image upload failed',
        statusCode: response.statusCode,
      );
    }
  } finally {
    if (httpClient == null) client.close();
  }

  final read = await api.postJson(InventoryEndpoints.mediaReadUrl(wsId), {
    'path': path,
    if (ticket['provider'] case final String provider) 'provider': provider,
  });
  final readUrl = read['readUrl'];
  if (readUrl is! String || readUrl.isEmpty) {
    throw const ApiException(message: 'Image URL unavailable', statusCode: 0);
  }
  return inventoryImageShareUrl(wsId, path);
}

Future<http.Response> _put(
  http.Client client,
  Uri uri,
  Map<String, String> headers,
  List<int> bytes,
) async {
  try {
    return await client
        .put(uri, headers: headers, body: Uint8List.fromList(bytes))
        .timeout(const Duration(seconds: 60));
  } on SocketException catch (_) {
    throw const ApiException.transport(message: 'Image upload lost');
  } on http.ClientException catch (_) {
    throw const ApiException.transport(message: 'Image upload lost');
  } on TimeoutException catch (_) {
    throw const ApiException.transport(message: 'Image upload timed out');
  }
}
