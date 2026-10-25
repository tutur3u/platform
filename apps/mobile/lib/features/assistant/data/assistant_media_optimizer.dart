import 'dart:async';
import 'dart:isolate';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/features/assistant/data/assistant_image_metadata.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

/// Matches the server's per-file cap: a model request injects a chat's
/// attachments within a 32 MiB budget, so larger files would never reach it.
const int assistantMaxAttachmentBytes = 32 * 1024 * 1024;

/// Longest image edge sent to the model; larger photos only add bytes.
const assistantMaxImageEdge = 2048;
const assistantJpegQuality = 82;

const _reencodedImageTypes = {
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
};

/// Produces an EXIF-free, orientation-corrected JPEG whose longest edge is at
/// most `maxEdge`.
abstract interface class AssistantImageEncoder {
  Future<Uint8List?> encodeJpeg(
    PlatformFile source, {
    required int maxEdge,
    required int quality,
  });
}

class AssistantMediaOptimization {
  const AssistantMediaOptimization({
    required this.result,
    required this.originalBytes,
  });

  final AssistantFilePickerResult result;
  final int originalBytes;

  bool get optimized => result.size != originalBytes;
}

/// Shrinks photos before upload. Voice notes are recorded speech-optimal at
/// capture (`assistantVoiceRecordConfig`); other files upload unchanged.
class AssistantMediaOptimizer {
  const AssistantMediaOptimizer({AssistantImageEncoder? encoder})
    : _encoder = encoder ?? const AssistantNativeImageEncoder();

  final AssistantImageEncoder _encoder;

  Future<AssistantMediaOptimization> optimize(
    AssistantFilePickerResult picked,
  ) async {
    final mime = picked.mimeType.toLowerCase();
    if (!_reencodedImageTypes.contains(mime)) {
      return AssistantMediaOptimization(
        result: picked,
        originalBytes: picked.size,
      );
    }
    final original = await picked.file.readAsBytes();
    final heif = mime == 'image/heic' || mime == 'image/heif';
    // A signature check is cheap; bytes no codec recognizes upload unchanged.
    if (!heif && img.findDecoderForData(original) == null) {
      return AssistantMediaOptimization(
        result: picked,
        originalBytes: picked.size,
      );
    }
    // Screenshots with transparency would lose it as JPEG; keep the PNG, but
    // never its EXIF/GPS, text or timestamp chunks.
    if (mime == 'image/png' && pngHasAlpha(original)) {
      final stripped = stripPngMetadata(original);
      if (stripped == null) throw _unsupported;
      return _inMemory(picked, stripped, picked.name, mime);
    }
    Uint8List? encoded;
    try {
      encoded = await _encoder.encodeJpeg(
        picked.file,
        maxEdge: assistantMaxImageEdge,
        quality: assistantJpegQuality,
      );
    } on Object {
      encoded = null;
    }
    var bytes = encoded;
    if (mime == 'image/png' &&
        (bytes == null || bytes.length >= original.length)) {
      // Flat screenshots compress better as PNG; keep it, minus metadata.
      final stripped = stripPngMetadata(original);
      if (stripped != null) {
        return _inMemory(picked, stripped, picked.name, mime);
      }
    }
    if (mime == 'image/jpeg' &&
        (bytes == null || bytes.length >= original.length)) {
      // Re-encoding would grow an already small JPEG; still drop its location
      // and camera metadata when that keeps the pixels upright.
      bytes = stripJpegMetadataIfUpright(original) ?? bytes;
    }
    // Fail safe: the original may carry location and camera metadata, so an
    // image that could be neither re-encoded nor stripped never uploads.
    if (bytes == null || bytes.isEmpty) throw _unsupported;
    return _inMemory(picked, bytes, _jpegName(picked.name), 'image/jpeg');
  }

  static const _unsupported = AssistantAttachmentUploadException(
    AssistantAttachmentFailure.unsupported,
  );

  static AssistantMediaOptimization _inMemory(
    AssistantFilePickerResult picked,
    Uint8List bytes,
    String name,
    String mimeType,
  ) => AssistantMediaOptimization(
    originalBytes: picked.size,
    result: AssistantFilePickerResult(
      id: picked.id,
      file: AssistantMemoryFile(name: name, bytes: bytes),
      name: name,
      size: bytes.length,
      path: picked.path,
      mimeType: mimeType,
    ),
  );

  static String _jpegName(String name) {
    final dot = name.lastIndexOf('.');
    final stem = dot > 0 ? name.substring(0, dot) : name;
    return '${stem.isEmpty ? 'image' : stem}.jpg';
  }
}

/// PNG color types 4 and 6 carry alpha; a tRNS chunk adds it to the others.
bool pngHasAlpha(Uint8List bytes) {
  if (bytes.length < 26) return false;
  final colorType = bytes[25];
  if (colorType == 4 || colorType == 6) return true;
  var offset = 8;
  while (offset + 8 <= bytes.length) {
    final length = ByteData.sublistView(bytes, offset, offset + 4).getUint32(0);
    final type = String.fromCharCodes(bytes.sublist(offset + 4, offset + 8));
    if (type == 'tRNS') return true;
    if (type == 'IDAT' || type == 'IEND') return false;
    offset += 12 + length;
  }
  return false;
}

/// Uses the platform codec (HEIC support, off the UI isolate), falling back to
/// the pure Dart codec where the plugin is unavailable.
class AssistantNativeImageEncoder implements AssistantImageEncoder {
  const AssistantNativeImageEncoder();

  @override
  Future<Uint8List?> encodeJpeg(
    PlatformFile source, {
    required int maxEdge,
    required int quality,
  }) async {
    final bytes = await source.readAsBytes();
    try {
      // The engine reads only the header here, including HEIC on iOS.
      final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
      final descriptor = await ui.ImageDescriptor.encoded(buffer);
      final width = descriptor.width;
      final height = descriptor.height;
      descriptor.dispose();
      buffer.dispose();
      // The plugin scales until both edges reach the minimum, so an equal
      // minimum derived from the short edge caps the long edge at [maxEdge].
      final longEdge = width > height ? width : height;
      final shortEdge = width > height ? height : width;
      final target = longEdge > maxEdge && shortEdge > 0
          ? (shortEdge * maxEdge / longEdge).floor()
          : (shortEdge > 0 ? shortEdge : maxEdge);
      return await FlutterImageCompress.compressWithList(
        bytes,
        minWidth: target,
        minHeight: target,
        quality: quality,
        // Plugin defaults, restated because orientation and privacy depend on
        // them.
        // ignore: avoid_redundant_argument_values
        autoCorrectionAngle: true,
        // Plugin default, restated: EXIF must never leave the device.
        // ignore: avoid_redundant_argument_values
        keepExif: false,
      );
    } on Object {
      return await const AssistantDartImageEncoder().encodeJpeg(
        source,
        maxEdge: maxEdge,
        quality: quality,
      );
    }
  }
}

/// Decodes, applies EXIF orientation, resizes and re-encodes in an isolate.
class AssistantDartImageEncoder implements AssistantImageEncoder {
  const AssistantDartImageEncoder();

  @override
  Future<Uint8List?> encodeJpeg(
    PlatformFile source, {
    required int maxEdge,
    required int quality,
  }) async {
    final bytes = await source.readAsBytes();
    return await Isolate.run(
      () => encodeAssistantJpeg(bytes, maxEdge, quality),
    );
  }
}

Uint8List? encodeAssistantJpeg(Uint8List bytes, int maxEdge, int quality) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return null;
  var image = img.bakeOrientation(decoded);
  final longEdge = image.width > image.height ? image.width : image.height;
  if (longEdge > maxEdge) {
    image = image.width >= image.height
        ? img.copyResize(image, width: maxEdge)
        : img.copyResize(image, height: maxEdge);
  }
  if (image.hasAlpha) {
    // JPEG has no alpha; flatten onto white instead of black.
    final background = img.Image(width: image.width, height: image.height)
      ..clear(img.ColorRgb8(255, 255, 255));
    image = img.compositeImage(background, image);
  }
  // Location, camera serials and the original orientation tag stay on device.
  image.exif = img.ExifData();
  return img.encodeJpg(image, quality: quality);
}
