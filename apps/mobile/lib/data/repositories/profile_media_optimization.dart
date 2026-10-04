import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as image;

/// Bounds uploads before decoding and moves image work off the UI isolate.
Future<Uint8List> optimizeProfileMedia(
  File file, {
  required bool banner,
}) async {
  if (await file.length() > 20 * 1024 * 1024) {
    throw const FormatException('Image exceeds input limit');
  }
  final bytes = await file.readAsBytes();
  return await compute(optimizeProfileMediaBytes, (
    bytes: bytes,
    banner: banner,
  ));
}

@visibleForTesting
Uint8List optimizeProfileMediaBytes(({Uint8List bytes, bool banner}) input) {
  if (input.bytes.length > 20 * 1024 * 1024) {
    throw const FormatException('Image exceeds input limit');
  }
  try {
    return _decodeProfileMedia(input);
  } on FormatException {
    rethrow;
  } on Object {
    throw const FormatException('Image cannot be decoded');
  }
}

Uint8List _decodeProfileMedia(({Uint8List bytes, bool banner}) input) {
  final decoder = image.findDecoderForData(input.bytes);
  final info = decoder?.startDecode(input.bytes);
  if (info == null ||
      info.width <= 0 ||
      info.height <= 0 ||
      info.width * info.height > 40 * 1000 * 1000) {
    throw const FormatException('Image dimensions are unsupported');
  }
  final decoded = decoder!.decodeFrame(0);
  if (decoded == null) throw const FormatException('Image cannot be decoded');
  var oriented = image.bakeOrientation(decoded);
  final maximum = input.banner ? 2048 : 1024;
  if (oriented.width > maximum || oriented.height > maximum) {
    oriented = image.copyResize(
      oriented,
      width: oriented.width >= oriented.height ? maximum : null,
      height: oriented.height > oriented.width ? maximum : null,
    );
  }
  final result = image.encodeJpg(oriented, quality: 82);
  if (result.length > (input.banner ? 5 : 2) * 1024 * 1024) {
    throw const FormatException('Optimized image exceeds upload limit');
  }
  return result;
}
