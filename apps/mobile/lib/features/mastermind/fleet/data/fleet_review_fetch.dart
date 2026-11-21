import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';

/// The image type the leading bytes prove (PNG, JPEG or WebP), or null.
String? fleetSniffReviewImage(Uint8List bytes) {
  bool starts(List<int> sig) =>
      bytes.length >= sig.length &&
      [for (var i = 0; i < sig.length; i++) bytes[i] == sig[i]].every((b) => b);
  if (starts(const [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (starts(const [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts(const [0x52, 0x49, 0x46, 0x46]) &&
      bytes.length >= 12 &&
      bytes[8] == 0x57 &&
      bytes[9] == 0x45 &&
      bytes[10] == 0x42 &&
      bytes[11] == 0x50) {
    return 'image/webp';
  }
  return null;
}

/// A first-party hosted preview's bytes: the snapshot URL as checked by
/// [fleetSafeReviewImage] (re-checked here), fetched with no credentials and
/// no redirects, stopped past [FleetRepository.reviewAssetMaxBytes], and
/// kept only when its bytes carry an image signature.
Future<Uint8List> fleetFetchHostedReviewImage(
  Uri url, {
  http.Client? client,
}) async {
  final safe = fleetSafeReviewImage(url.toString());
  if (safe == null) throw const FleetException(FleetFailure.unreadable);
  final http_ = client ?? http.Client();
  try {
    final request = http.Request('GET', safe)..followRedirects = false;
    final response = await http_
        .send(request)
        .timeout(const Duration(seconds: 15));
    const max = FleetRepository.reviewAssetMaxBytes;
    if (response.statusCode != 200 || (response.contentLength ?? 0) > max) {
      await response.stream.listen(null).cancel();
      throw const FleetException(FleetFailure.unavailable);
    }
    final bytes = BytesBuilder(copy: false);
    await for (final chunk in response.stream.timeout(
      const Duration(seconds: 30),
    )) {
      if (bytes.length + chunk.length > max) {
        throw const FleetException(FleetFailure.unreadable);
      }
      bytes.add(chunk);
    }
    final out = bytes.takeBytes();
    if (fleetSniffReviewImage(out) == null) {
      throw const FleetException(FleetFailure.unreadable);
    }
    return out;
  } finally {
    if (client == null) http_.close();
  }
}
