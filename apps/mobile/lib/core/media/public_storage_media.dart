/// Recognises public media URLs served by first-party storage, without
/// trusting any particular storage host.
///
/// The app never builds storage URLs. It only classifies URLs the server
/// returned, so caching and playback keep working when the storage backend or
/// CDN host changes. Two shapes are recognised on any http(s) host:
/// - `/storage/v1/object/public/{bucket}/{key...}` (object storage gateway)
/// - `https://cdn.tuturuuu.com/{bucket}/{key...}` (first-party CDN)
library;

const _cdnHost = 'cdn.tuturuuu.com';
const _gatewayPrefix = ['storage', 'v1', 'object', 'public'];

/// A public storage object: its bucket and the key segments inside it.
class PublicStorageObject {
  const PublicStorageObject(this.bucket, this.key);

  final String bucket;
  final List<String> key;
}

/// Parses [url] as a public storage object URL, or returns null.
///
/// Rejects URLs with credentials, queries, fragments, or `..` segments, since
/// those are signed, private, or ambiguous rather than public objects.
PublicStorageObject? parsePublicStorageObject(String url) {
  final uri = Uri.tryParse(url.trim());
  if (uri == null ||
      !{'http', 'https'}.contains(uri.scheme) ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment) {
    return null;
  }
  final segments = uri.pathSegments;
  if (segments.any((segment) => segment.isEmpty || segment == '..')) {
    return null;
  }
  if (segments.length > _gatewayPrefix.length + 1 &&
      _gatewayPrefix.indexed.every((entry) => segments[entry.$1] == entry.$2)) {
    final rest = segments.sublist(_gatewayPrefix.length);
    return PublicStorageObject(rest.first, rest.sublist(1));
  }
  if (uri.host == _cdnHost && segments.length > 1) {
    return PublicStorageObject(segments.first, segments.sublist(1));
  }
  return null;
}

/// Whether [url] is a public first-party storage object on any host.
bool isPublicStorageMediaUrl(String url) =>
    parsePublicStorageObject(url) != null;
