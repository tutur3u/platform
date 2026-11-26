import 'dart:typed_data';

import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/repositories/inventory_product_image_cache.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Stable sign-on-read URL for an uploaded workspace object, the absolute
/// form of the web's `buildWorkspaceStorageShareUrl`.
///
/// [origin] defaults to the canonical platform API origin, never a
/// device-local alias such as the Android emulator's host loopback.
String inventoryImageShareUrl(String wsId, String path, {String? origin}) {
  final route = DriveEndpoints.share(Uri.encodeComponent(wsId));
  final query = Uri(queryParameters: {'path': path}).query;
  return '${origin ?? ApiConfig.canonicalBaseUrlForPath(route)}$route?$query';
}

/// Where a stored product image URL is read from.
sealed class InventoryImageSource {
  const InventoryImageSource();
}

/// Any other HTTPS URL (for example a public CDN image), read directly.
final class InventoryImageDirect extends InventoryImageSource {
  const InventoryImageDirect();
}

/// A workspace object: a share URL on the platform origin, or a Supabase
/// signed `workspaces` URL ([legacy]) whose token expires.
final class InventoryImageObject extends InventoryImageSource {
  const InventoryImageObject(
    this.path, {
    required this.legacy,
    this.slugNamed = false,
  });

  final String path;
  final bool legacy;

  /// The stored URL names the workspace by a route slug, which only the
  /// product image route can check against the product's workspace.
  final bool slugNamed;
}

/// A storage URL for another workspace or an unexpected host; never read.
final class InventoryImageRefused extends InventoryImageSource {
  const InventoryImageRefused();
}

/// Classifies [url] for a product of [workspaceId]. Storage URLs are only
/// trusted for that workspace on an allow-listed host: the platform API
/// origin for share URLs and the configured Supabase project for signed
/// ones.
InventoryImageSource classifyInventoryImageUrl(
  String url, {
  required String workspaceId,
  Set<String>? platformHosts,
  Set<String>? storageHosts,
}) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https') {
    return const InventoryImageRefused();
  }
  final segments = uri.pathSegments;
  final isShare =
      segments.length == 6 &&
      segments[0] == 'api' &&
      segments[1] == 'v1' &&
      segments[2] == 'workspaces' &&
      segments[4] == 'storage' &&
      segments[5] == 'share';
  if (isShare) {
    final path = uri.queryParameters['path'];
    // A stored URL may name the workspace by the `personal` or `internal`
    // route slug; the product image route checks it against the product's
    // workspace, so only those slugs pass besides the workspace UUID.
    final workspace = segments[3].toLowerCase();
    if (!(platformHosts ?? _platformHosts()).contains(uri.host) ||
        (workspace != workspaceId.toLowerCase() &&
            !_workspaceSlugs.contains(workspace)) ||
        path == null ||
        !_safePath(path)) {
      return const InventoryImageRefused();
    }
    return InventoryImageObject(
      path,
      legacy: false,
      slugNamed: workspace != workspaceId.toLowerCase(),
    );
  }
  const signed = ['storage', 'v1', 'object', 'sign', 'workspaces'];
  final isSigned =
      segments.length > 6 &&
      [for (var i = 0; i < signed.length; i++) segments[i]].join('/') ==
          signed.join('/');
  if (isSigned) {
    final path = segments.skip(6).join('/');
    if (!(storageHosts ?? _storageHosts()).contains(uri.host) ||
        !uri.queryParameters.containsKey('token') ||
        segments[5].toLowerCase() != workspaceId.toLowerCase() ||
        !_safePath(path)) {
      return const InventoryImageRefused();
    }
    return InventoryImageObject(path, legacy: true);
  }
  return const InventoryImageDirect();
}

Set<String> _platformHosts() {
  final route = DriveEndpoints.share('ws');
  return {
    for (final origin in [
      ApiConfig.canonicalBaseUrlForPath(route),
      ApiConfig.baseUrlForPath(route),
    ])
      ?Uri.tryParse(origin)?.host,
  }..remove('');
}

Set<String> _storageHosts() =>
    {?Uri.tryParse(Env.supabaseUrl)?.host}..remove('');

const Set<String> _workspaceSlugs = {'personal', 'internal'};

bool _safePath(String path) =>
    path.isNotEmpty &&
    !path.split('/').any((part) => part.isEmpty || part == '.' || part == '..');

/// A product image that cannot be shown; the UI keeps its placeholder.
class InventoryImageUnavailable implements Exception {
  const InventoryImageUnavailable();
}

/// Images the server refused this session, keyed by account, workspace and
/// path, so a reader without access is not asked again on every rebuild and
/// one account's refusal never hides another account's image.
final Set<String> _refusedImages = {};

/// Loads the image of product [productId] in [workspaceId]. Workspace
/// objects get a fresh signed URL with the session, first from the product
/// image route (inventory read access is enough), then from the storage
/// share route when the product route is unavailable; the media request
/// itself never carries the session token. When access is refused, a
/// legacy signed URL is read as stored and anything else throws
/// [InventoryImageUnavailable].
Future<Uint8List> fetchInventoryProductImage(
  String url, {
  required String workspaceId,
  String? productId,
  String? userId,
  ApiClient? api,
  Future<Uint8List> Function(String url)? download,
  Set<String>? platformHosts,
  Set<String>? storageHosts,
}) async {
  final fetch = download ?? InventoryProductImageCache.downloadBytes;
  final source = classifyInventoryImageUrl(
    url,
    workspaceId: workspaceId,
    platformHosts: platformHosts,
    storageHosts: storageHosts,
  );
  switch (source) {
    case InventoryImageRefused():
      throw const InventoryImageUnavailable();
    case InventoryImageDirect():
      return await fetch(url);
    case InventoryImageObject(:final path, :final legacy, :final slugNamed):
      final refusalKey = '${userId ?? ''}/$workspaceId/$path';
      Future<Uint8List> refused() async {
        if (legacy) return await fetch(url);
        throw const InventoryImageUnavailable();
      }

      if (_refusedImages.contains(refusalKey)) return await refused();
      final client = api ?? ApiClient();
      String? signedUrl;
      if (productId != null && productId.isNotEmpty) {
        try {
          final route = InventoryEndpoints.productImage(workspaceId, productId);
          final body = await client.getJson('$route?format=json');
          final value = body['signedUrl'];
          if (value is String) signedUrl = value;
        } on ApiException catch (error) {
          // A slug-named URL has no fallback, so its 404 is final too.
          if (const {401, 403}.contains(error.statusCode) ||
              (slugNamed && error.statusCode == 404)) {
            _refusedImages.add(refusalKey);
            return await refused();
          }
          // Any other failure falls through to the share route.
        }
      }
      // The share route trusts the workspace in its own path, so a
      // slug-named URL never falls back to it.
      if ((signedUrl == null || signedUrl.isEmpty) && slugNamed) {
        return await refused();
      }
      if (signedUrl == null || signedUrl.isEmpty) {
        try {
          final signed = await client.postJson(
            DriveEndpoints.share(workspaceId),
            {'path': path},
          );
          final value = signed['signedUrl'];
          if (value is String) signedUrl = value;
        } on ApiException catch (error) {
          if (const {401, 403, 404}.contains(error.statusCode)) {
            _refusedImages.add(refusalKey);
          }
          return await refused();
        }
      }
      if (signedUrl == null || signedUrl.isEmpty) return await refused();
      return await fetch(signedUrl);
  }
}
