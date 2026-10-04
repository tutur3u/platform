import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

enum ProfileMediaKind { avatar, banner }

class OptimizedProfileMedia {
  const OptimizedProfileMedia(this.bytes, this.contentType, this.filename);
  final Uint8List bytes;
  final String contentType;
  final String filename;
}

Future<OptimizedProfileMedia> optimizeProfileMediaFile(
  File file, {
  ProfileMediaKind kind = ProfileMediaKind.avatar,
}) async {
  final maximum = kind == ProfileMediaKind.avatar
      ? 2 * 1024 * 1024
      : 5 * 1024 * 1024;
  if (await file.length() > maximum) {
    throw const FormatException('Source image exceeds the size limit');
  }
  return await optimizeProfileMediaBytes(await file.readAsBytes(), kind: kind);
}

/// Runs off the UI isolate; reused for new selections and old offline payloads.
Future<OptimizedProfileMedia> optimizeProfileMediaBytes(
  Uint8List bytes, {
  ProfileMediaKind kind = ProfileMediaKind.avatar,
}) => compute(_optimize, (bytes, kind));

OptimizedProfileMedia _optimize((Uint8List, ProfileMediaKind) input) {
  try {
    return _optimizeImage(input);
  } on FormatException {
    rethrow;
  } on Object {
    throw const FormatException('Invalid profile image');
  }
}

OptimizedProfileMedia _optimizeImage((Uint8List, ProfileMediaKind) input) {
  final (bytes, kind) = input;
  final avatar = kind == ProfileMediaKind.avatar;
  if (bytes.isEmpty || bytes.length > (avatar ? 2 : 5) * 1024 * 1024) {
    throw const FormatException('Source image exceeds the size limit');
  }
  if (bytes.length < 12) throw const FormatException('Invalid profile image');
  final decoder = bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255
      ? img.JpegDecoder()
      : bytes[0] == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71
      ? img.PngDecoder()
      : String.fromCharCodes(bytes.sublist(0, 6)).startsWith('GIF8')
      ? img.GifDecoder()
      : String.fromCharCodes(bytes.sublist(0, 4)) == 'RIFF' &&
            String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP'
      ? img.WebPDecoder()
      : null;
  if (decoder == null ||
      ![
        img.ImageFormat.jpg,
        img.ImageFormat.png,
        img.ImageFormat.webp,
        img.ImageFormat.gif,
      ].contains(decoder.format)) {
    throw const FormatException('Unsupported profile image');
  }
  final info = decoder.startDecode(bytes);
  if (info == null ||
      info.width < 1 ||
      info.height < 1 ||
      info.width * info.height > 20000000) {
    throw const FormatException('Invalid or excessively large profile image');
  }
  final decoded = decoder.decodeFrame(0);
  if (decoded == null) throw const FormatException('Invalid profile image');
  final oriented = img.bakeOrientation(decoded);
  final ratio = math.min(
    1,
    math.min(
      (avatar ? 1024 : 2560) / oriented.width,
      (avatar ? 1024 : 1440) / oriented.height,
    ),
  );
  for (final scale in [1.0, 0.7, 0.49, 0.34]) {
    final resized = img.copyResize(
      oriented,
      width: math.max(1, (oriented.width * ratio * scale).round()),
      height: math.max(1, (oriented.height * ratio * scale).round()),
      interpolation: img.Interpolation.average,
    );
    // Construct pixel-only output to discard EXIF, ICC and text metadata.
    final clean = img.Image.fromBytes(
      width: resized.width,
      height: resized.height,
      bytes: resized.getBytes(order: img.ChannelOrder.rgba).buffer,
      numChannels: 4,
      order: img.ChannelOrder.rgba,
    );
    final output = img.encodePng(clean);
    if (output.length <= (avatar ? 1000000 : 2000000)) {
      return OptimizedProfileMedia(output, 'image/png', '${kind.name}.png');
    }
  }
  throw const FormatException('Optimized image exceeds the size limit');
}
