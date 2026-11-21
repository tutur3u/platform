part of 'fleet_models.dart';

/// Image types Web accepts for an uploaded review preview.
const fleetReviewImageTypes = {'image/png', 'image/jpeg', 'image/webp'};

const _reviewUrlMax = 2048;
const _reviewArtifactHost = 'claude.ai';
const _reviewArtifactPaths = [
  '/artifact/',
  '/code/artifact/',
  '/public/artifacts/',
];
final _reviewAssetId = RegExp(r'^[0-9a-f]{64}$');
final _reviewImagePath = RegExp(r'\.(png|jpe?g|webp)$', caseSensitive: false);

bool _firstParty(String host) =>
    host == 'tuturuuu.com' || host.endsWith('.tuturuuu.com');

/// An https link with no credentials, explicit port, fragment or dot
/// segments, or null.
Uri? _reviewHttps(Object? raw) {
  final text = _string(raw);
  if (text == null || text.length > _reviewUrlMax) return null;
  final uri = Uri.tryParse(text);
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty ||
      uri.hasPort ||
      uri.hasFragment ||
      uri.pathSegments.any((s) => s == '.' || s == '..')) {
    return null;
  }
  return uri;
}

/// The full-mockup link when it is safe to open: a claude.ai artifact page
/// or a first-party Tuturuuu page. Web checks the same; the app checks again
/// so a link it opens never depends on the server alone.
Uri? fleetSafeReviewLink(Object? raw) {
  final uri = _reviewHttps(raw);
  if (uri == null) return null;
  final host = uri.host.toLowerCase();
  final artifact =
      host == _reviewArtifactHost &&
      _reviewArtifactPaths.any((prefix) => uri.path.startsWith(prefix));
  return artifact || _firstParty(host) ? uri : null;
}

/// A hosted preview image when it is safe to load: a first-party host, no
/// query, and an image file extension.
Uri? fleetSafeReviewImage(Object? raw) {
  final uri = _reviewHttps(raw);
  if (uri == null || uri.hasQuery) return null;
  if (!_firstParty(uri.host.toLowerCase())) return null;
  return _reviewImagePath.hasMatch(uri.path) ? uri : null;
}

/// A review's preview: an image on a first-party host
/// ([FleetHostedPreview]), or an asset the publisher uploaded
/// ([FleetAssetPreview]) that Web serves to the owner only.
sealed class FleetReviewPreview {
  const FleetReviewPreview();

  static FleetReviewPreview? parse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    switch (raw['source']) {
      case 'hosted':
        final url = fleetSafeReviewImage(raw['url']);
        return url == null ? null : FleetHostedPreview(url);
      case 'asset':
        final id = raw['assetId'];
        final type = raw['contentType'];
        if (id is! String || !_reviewAssetId.hasMatch(id)) return null;
        if (!fleetReviewImageTypes.contains(type)) return null;
        return FleetAssetPreview(assetId: id, contentType: type as String);
    }
    return null;
  }
}

final class FleetHostedPreview extends FleetReviewPreview {
  const FleetHostedPreview(this.url);

  final Uri url;
}

final class FleetAssetPreview extends FleetReviewPreview {
  const FleetAssetPreview({required this.assetId, required this.contentType});

  /// The image's sha256, hex.
  final String assetId;
  final String contentType;
}

/// A design-review ask: the full mockup to open and an optional preview.
/// A review whose mockup link fails the check is dropped; a preview that
/// fails it is left out and the review stays.
class FleetReview {
  const FleetReview({required this.mockupUrl, this.preview});

  static FleetReview? parse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final mockup = fleetSafeReviewLink(raw['mockupUrl']);
    if (mockup == null) return null;
    return FleetReview(
      mockupUrl: mockup,
      preview: FleetReviewPreview.parse(raw['preview']),
    );
  }

  final Uri mockupUrl;
  final FleetReviewPreview? preview;
}
