import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/config/env.dart';

/// Only explicitly public first-party profile media enters the disk cache.
/// Signed/private URLs retain NetworkImage's transient behavior instead.
bool cacheableProfileMedia(String url, String actorId) {
  final uri = Uri.tryParse(url);
  final host = Uri.tryParse(Env.supabaseUrl);
  if (uri == null ||
      host == null ||
      !uri.hasAuthority ||
      !host.hasAuthority ||
      !{'http', 'https'}.contains(uri.scheme) ||
      uri.userInfo.isNotEmpty ||
      uri.pathSegments.contains('..') ||
      uri.origin != host.origin ||
      uri.hasQuery ||
      uri.hasFragment ||
      actorId.isEmpty) {
    return false;
  }
  return ['avatars', 'banners'].any(
    (bucket) =>
        uri.path.startsWith('/storage/v1/object/public/$bucket/$actorId/'),
  );
}

ImageProvider<Object> profileMediaImage(String url, String actorId) =>
    cacheableProfileMedia(url, actorId)
    ? CachedNetworkImageProvider(url, cacheKey: 'profile:$actorId:$url')
    : NetworkImage(url);
