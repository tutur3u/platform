import 'package:flutter/material.dart';
import 'package:mobile/core/observability/mobile_observability.dart';

/// Displays a network avatar over its fallback, including while offline.
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
    final image = url == null || url.isEmpty ? null : _AvatarImage(url);
    return CircleAvatar(
      radius: radius,
      backgroundColor: backgroundColor,
      foregroundImage: image,
      // Image loading failures are handled by this avatar's visible fallback.
      onForegroundImageError: image == null ? null : _recordAvatarError,
      child: child,
    );
  }
}

void _recordAvatarError(Object error, StackTrace? stackTrace) {
  MobileObservability.instance.recordNonFatal(
    'avatar_image',
    error,
    stackTrace,
  );
}

/// Keeps pending image errors handled after a decoration stops listening.
class _AvatarImage extends ImageProvider<NetworkImage> {
  const _AvatarImage(this.url);

  final String url;

  @override
  Future<NetworkImage> obtainKey(ImageConfiguration configuration) =>
      NetworkImage(url).obtainKey(configuration);

  @override
  ImageStreamCompleter loadImage(
    NetworkImage key,
    ImageDecoderCallback decode,
  ) => key.loadImage(key, decode);

  @override
  void resolveStreamForKey(
    ImageConfiguration configuration,
    ImageStream stream,
    NetworkImage key,
    ImageErrorListener handleError,
  ) {
    super.resolveStreamForKey(configuration, stream, key, handleError);
    // Flutter removes this listener after the first frame or error. It neither
    // keeps the widget alive nor changes other images' global error handling.
    stream.completer?.addEphemeralErrorListener(_recordAvatarError);
  }
}
