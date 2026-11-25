import 'dart:typed_data';

import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/inventory_product_image_cache.dart';
import 'package:mobile/data/sources/api_client.dart';

final RegExp _workspaceId = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

/// Stable sign-on-read URL for an uploaded workspace object, the absolute
/// form of the web's `buildWorkspaceStorageShareUrl`.
///
/// [origin] defaults to the platform API origin that serves the route.
String inventoryImageShareUrl(String wsId, String path, {String? origin}) {
  final route = DriveEndpoints.share(Uri.encodeComponent(wsId));
  final query = Uri(queryParameters: {'path': path}).query;
  return '${origin ?? ApiConfig.baseUrlForPath(route)}$route?$query';
}

/// The workspace object behind a stored product image URL: a share URL on
/// the platform origin, or a Supabase signed `workspaces` URL (whose token
/// expires). Other URLs, such as public CDN images, return null and load
/// directly.
({String wsId, String path})? inventoryImageStorageTarget(
  String url, {
  String? origin,
}) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https') return null;
  final segments = uri.pathSegments;
  if (segments.length == 6 &&
      segments[0] == 'api' &&
      segments[1] == 'v1' &&
      segments[2] == 'workspaces' &&
      segments[4] == 'storage' &&
      segments[5] == 'share') {
    final platform = Uri.tryParse(
      origin ?? ApiConfig.baseUrlForPath(DriveEndpoints.share(segments[3])),
    );
    final path = uri.queryParameters['path'];
    if (platform == null ||
        platform.host != uri.host ||
        !_workspaceId.hasMatch(segments[3]) ||
        path == null ||
        !_safePath(path)) {
      return null;
    }
    return (wsId: segments[3], path: path);
  }
  const signed = ['storage', 'v1', 'object', 'sign', 'workspaces'];
  if (segments.length > 6 &&
      uri.queryParameters.containsKey('token') &&
      [for (var i = 0; i < signed.length; i++) segments[i]].join('/') ==
          signed.join('/') &&
      _workspaceId.hasMatch(segments[5])) {
    final path = segments.skip(6).join('/');
    return _safePath(path) ? (wsId: segments[5], path: path) : null;
  }
  return null;
}

bool _isShareUrl(String url) =>
    Uri.tryParse(url)?.path.endsWith('/storage/share') ?? false;

bool _safePath(String path) =>
    path.isNotEmpty &&
    !path.split('/').any((part) => part.isEmpty || part == '.' || part == '..');

/// Loads a product image. Workspace objects get a fresh signed URL from the
/// share route with the session; the media request itself never carries the
/// session token.
Future<Uint8List> fetchInventoryProductImage(
  String url, {
  ApiClient? api,
  Future<Uint8List> Function(String url)? download,
  String? origin,
}) async {
  final fetch = download ?? InventoryProductImageCache.downloadBytes;
  final target = inventoryImageStorageTarget(url, origin: origin);
  if (target == null) return await fetch(url);
  final Map<String, dynamic> signed;
  try {
    signed = await (api ?? ApiClient()).postJson(
      DriveEndpoints.share(target.wsId),
      {'path': target.path},
    );
  } on ApiException {
    // A stored signed URL still works until it expires, even for readers
    // the share route refuses.
    if (_isShareUrl(url)) rethrow;
    return await fetch(url);
  }
  final signedUrl = signed['signedUrl'];
  if (signedUrl is! String || signedUrl.isEmpty) {
    throw StateError('Product image URL unavailable.');
  }
  return await fetch(signedUrl);
}
