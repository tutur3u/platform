import 'package:flutter/material.dart';
import 'package:mobile/core/observability/mobile_observability.dart';

/// Decode bound for avatars that omit [NetworkAvatar.radius]: the circle then
/// sizes itself to its child, so this radius keeps decoding bounded without
/// guessing the laid-out size.
const double _kRadiusDecodeFallback = 20;

/// Displays a network avatar over its fallback, including while offline.
///
/// The avatar decodes at its displayed size — its radius doubled and scaled by
/// the device pixel ratio, rounded up — instead of its source resolution, so
/// long lists of avatars keep the decoded-image cache small.
class NetworkAvatar extends StatelessWidget {
  const NetworkAvatar({
    required this.child,
    this.avatarUrl,
    this.radius,
    this.backgroundColor,
    super.key,
  });

  final String? avatarUrl;
  final double? radius;
  final Color? backgroundColor;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final url = avatarUrl?.trim();
    final image = url == null || url.isEmpty
        ? null
        : _AvatarImage(url, _decodeWidth(context));
    return CircleAvatar(
      radius: radius,
      backgroundColor: backgroundColor,
      foregroundImage: image,
      // Image loading failures are handled by this avatar's visible fallback.
      onForegroundImageError: image == null ? null : _recordAvatarError,
      child: child,
    );
  }

  int _decodeWidth(BuildContext context) {
    final diameter = (radius ?? _kRadiusDecodeFallback) * 2;
    final width = (diameter * MediaQuery.devicePixelRatioOf(context)).ceil();
    return width < 1 ? 1 : width;
  }
}

void _recordAvatarError(Object error, StackTrace? stackTrace) {
  MobileObservability.instance.recordNonFatal(
    'avatar_image',
    error,
    stackTrace,
  );
}

/// Keeps pending image errors handled after a decoration stops listening, and
/// decodes the avatar at its displayed width instead of full resolution.
@immutable
class _AvatarImage extends ImageProvider<ResizeImageKey> {
  _AvatarImage(this.url, this.decodeWidth)
    : _resized = ResizeImage(NetworkImage(url), width: decodeWidth);

  final String url;

  /// Device-pixel width the avatar decodes at; smaller sources are untouched.
  final int decodeWidth;

  final ResizeImage _resized;

  @override
  bool operator ==(Object other) =>
      other.runtimeType == runtimeType &&
      other is _AvatarImage &&
      other.url == url &&
      other.decodeWidth == decodeWidth;

  @override
  int get hashCode => Object.hash(runtimeType, url, decodeWidth);

  @override
  Future<ResizeImageKey> obtainKey(ImageConfiguration configuration) =>
      _resized.obtainKey(configuration);

  @override
  ImageStreamCompleter loadImage(
    ResizeImageKey key,
    ImageDecoderCallback decode,
  ) => _resized.loadImage(key, decode);

  @override
  void resolveStreamForKey(
    ImageConfiguration configuration,
    ImageStream stream,
    ResizeImageKey key,
    ImageErrorListener handleError,
  ) {
    super.resolveStreamForKey(configuration, stream, key, handleError);
    // Flutter removes this listener after the first frame or error. It neither
    // keeps the widget alive nor changes other images' global error handling.
    stream.completer?.addEphemeralErrorListener(_recordAvatarError);
  }
}
