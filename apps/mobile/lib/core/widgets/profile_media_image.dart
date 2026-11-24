import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/media/public_storage_media.dart';

const _profileBuckets = {'avatars', 'banners'};

/// The disk-cache key for public first-party profile media owned by
/// [actorId], or null when [url] must stay uncached.
///
/// Keys use the bucket, actor and object path, not the host, so the same
/// object served from the storage gateway or the CDN shares one cache entry.
/// Signed or private URLs keep NetworkImage's transient behavior instead.
String? profileMediaCacheKey(String url, String actorId) {
  if (actorId.isEmpty) return null;
  final object = parsePublicStorageObject(url);
  if (object == null ||
      !_profileBuckets.contains(object.bucket) ||
      object.key.length < 2 ||
      object.key.first != actorId) {
    return null;
  }
  return 'profile:${object.bucket}:${object.key.join('/')}';
}

/// Only explicitly public first-party profile media enters the disk cache.
bool cacheableProfileMedia(String url, String actorId) =>
    profileMediaCacheKey(url, actorId) != null;

ImageProvider<Object> profileMediaImage(String url, String actorId) {
  final cacheKey = profileMediaCacheKey(url, actorId);
  return cacheKey == null
      ? NetworkImage(url)
      : CachedNetworkImageProvider(url, cacheKey: cacheKey);
}
