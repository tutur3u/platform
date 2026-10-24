import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

enum ProfileMediaKind { avatar, banner }

/// A source can exceed the upload limit before compression. Decoding still has
/// an independent pixel ceiling and the encoded result keeps its smaller cap.
const int profileMediaSourceByteLimit = 64 * 1024 * 1024;

class ProfileMediaSizeException extends FormatException {
  const ProfileMediaSizeException(super.message);
}

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
  if (await file.length() > profileMediaSourceByteLimit) {
    throw const ProfileMediaSizeException(
      'Source image exceeds the size limit',
    );
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
  if (bytes.isEmpty) throw const FormatException('Empty profile image');
  if (bytes.length > profileMediaSourceByteLimit) {
    throw const ProfileMediaSizeException(
      'Source image exceeds the size limit',
    );
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
  var width = math.max(1, (oriented.width * ratio).round());
  var height = math.max(1, (oriented.height * ratio).round());
  final byteLimit = avatar ? 1000000 : 2000000;
  while (true) {
    final resized = img.copyResize(
      oriented,
      width: width,
      height: height,
      interpolation: img.Interpolation.average,
    );
    // Pixel-only output discards EXIF, ICC and text metadata.
    final clean = img.Image.fromBytes(
      width: resized.width,
      height: resized.height,
      bytes: resized.getBytes(order: img.ChannelOrder.rgba).buffer,
      numChannels: 4,
      order: img.ChannelOrder.rgba,
    );
    var opaque = clean;
    if (clean.any((pixel) => pixel.a < 255)) {
      final png = img.encodePng(clean);
      if (png.length <= byteLimit) {
        return OptimizedProfileMedia(png, 'image/png', '${kind.name}.png');
      }
      opaque = img.Image(width: width, height: height);
      img.fill(opaque, color: img.ColorRgb8(255, 255, 255));
      img.compositeImage(opaque, clean);
    }
    for (final quality in [90, 82, 72, 60]) {
      final output = img.encodeJpg(opaque, quality: quality);
      if (output.length <= byteLimit) {
        return OptimizedProfileMedia(output, 'image/jpeg', '${kind.name}.jpg');
      }
    }
    if (width == 1 && height == 1) break;
    width = math.max(1, (width * 0.75).floor());
    height = math.max(1, (height * 0.75).floor());
  }
  throw const ProfileMediaSizeException(
    'Optimized image exceeds the size limit',
  );
}
