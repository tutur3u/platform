import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/sources/offline_api_request.dart';

/// Product images share encrypted storage, account/workspace scope, and quota
/// with their inventory snapshots. No Bearer token is sent to a media URL.
class InventoryProductImageCache {
  InventoryProductImageCache({
    CacheStore? store,
    String? Function()? currentUserId,
    Future<Uint8List> Function(String url)? fetchBytes,
  }) : store = store ?? CacheStore.instance,
       currentUserId = currentUserId ?? currentCacheUserId,
       _fetchBytes = fetchBytes ?? downloadBytes;

  static final InventoryProductImageCache instance =
      InventoryProductImageCache();
  static const int maxImageBytes = 8 * 1024 * 1024;
  final CacheStore store;
  final String? Function() currentUserId;
  final Future<Uint8List> Function(String url) _fetchBytes;

  CacheKey key(InventoryProduct product, String userId) => CacheKey(
    namespace: 'inventory.product-image',
    userId: userId,
    workspaceId: product.wsId,
    params: {
      'productId': product.id,
      'urlDigest': sha256
          .convert(utf8.encode(product.avatarUrl ?? ''))
          .toString(),
    },
  );

  Uint8List? peek(InventoryProduct product) {
    final user = currentUserId();
    if (user == null || !_hasImage(product)) return null;
    return store.peek(key: key(product, user), decode: _decode).data;
  }

  Future<Uint8List?> load(
    InventoryProduct product, {
    OfflineDownloadManifest? manifest,
  }) async {
    final user = currentUserId();
    if (user == null || !_hasImage(product)) return null;
    final cacheKey = key(product, user);
    final removalRevision = store.resourceRevisionFor(cacheKey);
    void checkScope() {
      manifest?.checkScope();
      if (currentUserId() != user ||
          store.resourceRevisionFor(cacheKey) != removalRevision) {
        throw StateError('Product image cache scope changed.');
      }
    }

    final cached = await store.read(key: cacheKey, decode: _decode);
    checkScope();
    var bytes = cached.data;
    if (bytes == null) {
      final loaded = await store.prefetch<Uint8List>(
        key: cacheKey,
        checkScope: checkScope,
        policy: const CachePolicy(
          staleAfter: Duration(days: 365),
          expireAfter: Duration(days: 365),
          refreshOnResume: false,
          refreshOnReconnect: false,
          allowBackgroundRefresh: false,
        ),
        decode: _decode,
        fetch: () async {
          final bytes = await OfflineApiRequest.paced(
            () => _fetchBytes(product.avatarUrl!),
          );
          checkScope();
          await _validate(bytes);
          checkScope();
          return {'bytes': base64Encode(bytes)};
        },
        tags: ['module:inventory', 'workspace:${product.wsId}'],
      );
      checkScope();
      bytes = loaded.data;
      if (bytes == null) throw StateError('Product image cache was cleared.');
    }
    final payload = {'bytes': base64Encode(bytes)};
    if (manifest != null) {
      await manifest.save(cacheKey, payload);
    }
    if (currentUserId() != user) {
      throw StateError('Product image account changed.');
    }
    return bytes;
  }

  static bool _hasImage(InventoryProduct product) =>
      product.wsId.isNotEmpty &&
      (product.avatarUrl?.trim().isNotEmpty ?? false);

  static Uint8List _decode(Object? json) {
    final bytes = base64Decode(
      (json! as Map<String, dynamic>)['bytes'] as String,
    );
    if (bytes.isEmpty || bytes.length > maxImageBytes) {
      throw const FormatException('Invalid cached product image.');
    }
    return bytes;
  }

  static Future<void> _validate(Uint8List bytes) async {
    if (bytes.isEmpty || bytes.length > maxImageBytes) {
      throw const FormatException('Product image exceeds download limit.');
    }
    final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    try {
      final descriptor = await ui.ImageDescriptor.encoded(buffer);
      try {
        if (descriptor.width > 8192 ||
            descriptor.height > 8192 ||
            descriptor.width * descriptor.height > 16 * 1024 * 1024) {
          throw const FormatException('Product image dimensions exceed limit.');
        }
      } finally {
        descriptor.dispose();
      }
    } finally {
      buffer.dispose();
    }
  }

  /// Bounded HTTPS redirects support Drive/CDN images without forwarding auth.
  static Future<Uint8List> downloadBytes(
    String url, {
    http.Client? client,
    Duration maxDuration = const Duration(seconds: 60),
  }) async {
    if (maxDuration <= Duration.zero ||
        maxDuration > const Duration(seconds: 60)) {
      throw ArgumentError.value(maxDuration, 'maxDuration');
    }
    var uri = _imageUri(url);
    final transport = client ?? http.Client();
    final started = Stopwatch()..start();
    Duration remaining() {
      final budget = maxDuration - started.elapsed;
      if (budget <= Duration.zero) {
        throw TimeoutException('Product image download timed out');
      }
      return budget < const Duration(seconds: 30)
          ? budget
          : const Duration(seconds: 30);
    }

    try {
      for (var redirects = 0; redirects <= 3; redirects++) {
        final response = await transport
            .send(http.Request('GET', uri)..followRedirects = false)
            .timeout(remaining());
        if ({301, 302, 303, 307, 308}.contains(response.statusCode)) {
          await response.stream.listen(null).cancel();
          final location = response.headers['location'];
          if (location == null || redirects == 3) {
            throw StateError('Product image redirect limit exceeded.');
          }
          uri = _imageUri(uri.resolve(location).toString());
          continue;
        }
        if (response.statusCode != 200 ||
            (response.contentLength ?? 0) > maxImageBytes) {
          await response.stream.listen(null).cancel();
          throw StateError('Product image download failed.');
        }
        final bytes = BytesBuilder(copy: false);
        final chunks = StreamIterator(response.stream);
        try {
          while (await chunks.moveNext().timeout(remaining())) {
            final chunk = chunks.current;
            if (bytes.length + chunk.length > maxImageBytes) {
              throw const FormatException(
                'Product image exceeds download limit.',
              );
            }
            bytes.add(chunk);
          }
        } finally {
          await chunks.cancel();
        }
        return bytes.takeBytes();
      }
      throw StateError('Product image download failed.');
    } finally {
      transport.close();
    }
  }

  static Uri _imageUri(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty) {
      throw const FormatException('Invalid product image URL.');
    }
    return uri;
  }
}
