import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/features/assistant/data/assistant_image_metadata.dart';
import 'package:mobile/features/assistant/data/assistant_media_optimizer.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/models/assistant_file_mime.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_voice_message_sheet.dart';
import 'package:record/record.dart';

/// Runs the pure Dart codec synchronously so tests see real pixels.
class _DartEncoder implements AssistantImageEncoder {
  const _DartEncoder();

  @override
  Future<Uint8List?> encodeJpeg(
    PlatformFile source, {
    required int maxEdge,
    required int quality,
  }) async => encodeAssistantJpeg(await source.readAsBytes(), maxEdge, quality);
}

class _NullEncoder implements AssistantImageEncoder {
  const _NullEncoder();

  @override
  Future<Uint8List?> encodeJpeg(
    PlatformFile source, {
    required int maxEdge,
    required int quality,
  }) async => null;
}

AssistantFilePickerResult _picked(String name, String mime, Uint8List bytes) =>
    AssistantFilePickerResult(
      id: 'id',
      file: AssistantMemoryFile(name: name, bytes: bytes),
      name: name,
      size: bytes.length,
      path: '/tmp/$name',
      mimeType: mime,
    );

/// A noisy photo (noise defeats compression, like a real camera frame) with a
/// GPS-bearing EXIF block and the given orientation tag.
Uint8List _photo({
  required int width,
  required int height,
  int orientation = 1,
  int quality = 100,
}) {
  final image = img.Image(width: width, height: height);
  var seed = 7;
  for (final pixel in image) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pixel
      ..r = seed & 0xff
      ..g = (seed >> 8) & 0xff
      ..b = (seed >> 16) & 0xff;
  }
  // Mark the top-left so orientation handling is observable.
  img.fillRect(
    image,
    x1: 0,
    y1: 0,
    x2: 31,
    y2: 31,
    color: img.ColorRgb8(255, 0, 0),
  );
  image.exif.imageIfd.orientation = orientation;
  image.exif.gpsIfd['GPSLatitude'] = img.IfdValueRational(10, 1);
  image.exif.imageIfd['Make'] = img.IfdValueAscii('TestCam');
  return img.encodeJpg(image, quality: quality);
}

void main() {
  const optimizer = AssistantMediaOptimizer(encoder: _DartEncoder());

  test('photos become smaller upright JPEGs without EXIF or GPS', () async {
    // Orientation 6 = rotate 90° clockwise to display: 4000x3000 → portrait.
    final original = _photo(width: 4000, height: 3000, orientation: 6);
    final result = await optimizer.optimize(
      _picked('IMG_0001.jpeg', 'image/jpeg', original),
    );

    final bytes = await result.result.file.readAsBytes();
    final decoded = img.decodeJpg(bytes)!;
    expect(result.result.mimeType, 'image/jpeg');
    expect(result.result.name, 'IMG_0001.jpg');
    expect(decoded.width, 1536);
    expect(decoded.height, 2048);
    expect(decoded.exif.isEmpty, isTrue);
    expect(decoded.exif.gpsIfd.isEmpty, isTrue);
    expect(result.originalBytes, original.length);
    expect(result.result.size, lessThan(original.length));
    // The red corner moved to the top-right after applying orientation 6.
    final corner = decoded.getPixel(decoded.width - 4, 4);
    expect(corner.r, greaterThan(200));
    expect(corner.g, lessThan(60));
    // ignore: avoid_print -- size evidence for the PR.
    print('jpeg 4000x3000: ${original.length} -> ${result.result.size} bytes');
  });

  test('opaque PNG photos convert to smaller JPEGs', () async {
    final png = img.encodePng(
      img.decodeJpg(_photo(width: 2400, height: 1600))!,
    );
    final result = await optimizer.optimize(
      _picked('render.png', 'image/png', png),
    );

    final decoded = img.decodeJpg(await result.result.file.readAsBytes())!;
    expect(result.result.mimeType, 'image/jpeg');
    expect(result.result.name, 'render.jpg');
    expect(decoded.width, 2048);
    expect(result.result.size, lessThan(png.length));
    // ignore: avoid_print -- size evidence for the PR.
    print('png photo 2400x1600: ${png.length} -> ${result.result.size} bytes');
  });

  test('flat PNG screenshots stay PNG when JPEG would be larger', () async {
    final image = img.Image(width: 1200, height: 800)
      ..clear(img.ColorRgb8(240, 240, 240));
    img.fillRect(
      image,
      x1: 100,
      y1: 100,
      x2: 900,
      y2: 500,
      color: img.ColorRgb8(20, 60, 200),
    );
    image.textData = {'Comment': 'private note'};
    final png = img.encodePng(image);
    final result = await optimizer.optimize(
      _picked('shot.png', 'image/png', png),
    );

    final bytes = await result.result.file.readAsBytes();
    expect(result.result.mimeType, 'image/png');
    expect(bytes.length, lessThan(png.length));
    expect(img.decodePng(bytes)!.textData, isNull);
    // ignore: avoid_print -- size evidence for the PR.
    print('png screenshot 1200x800: ${png.length} -> ${bytes.length} bytes');
  });

  test('PNGs with transparency stay PNG', () async {
    final image = img.Image(width: 64, height: 64, numChannels: 4)
      ..clear(img.ColorRgba8(0, 0, 0, 0));
    final png = img.encodePng(image);
    expect(pngHasAlpha(png), isTrue);

    final result = await optimizer.optimize(
      _picked('icon.png', 'image/png', png),
    );
    expect(result.result.mimeType, 'image/png');
    expect(result.optimized, isFalse);
  });

  test('transparent PNGs upload without EXIF/GPS or text chunks', () async {
    final image = img.Image(width: 32, height: 32, numChannels: 4)
      ..clear(img.ColorRgba8(10, 20, 30, 128));
    final png = _withPngChunks(img.encodePng(image), {
      'eXIf': _pngExifWithGps(),
      'tEXt': Uint8List.fromList('Comment\x00home address'.codeUnits),
      'iTXt': Uint8List.fromList('Author\x00\x00\x00\x00\x00me'.codeUnits),
    });
    expect(_pngChunkTypes(png), containsAll(['eXIf', 'tEXt', 'iTXt']));

    final result = await optimizer.optimize(
      _picked('icon.png', 'image/png', png),
    );

    final uploaded = await result.result.file.readAsBytes();
    expect(result.result.mimeType, 'image/png');
    expect(result.result.size, uploaded.length);
    expect(
      _pngChunkTypes(uploaded),
      isNot(anyOf(contains('eXIf'), contains('tEXt'), contains('iTXt'))),
    );
    final decoded = img.decodePng(uploaded)!;
    expect(decoded.hasAlpha, isTrue);
    expect(decoded.getPixel(0, 0).a, 128);
  });

  test('a malformed transparent PNG fails instead of uploading', () async {
    final image = img.Image(width: 8, height: 8, numChannels: 4);
    final png = img.encodePng(image);
    final truncated = Uint8List.sublistView(png, 0, png.length - 6);
    await expectLater(
      optimizer.optimize(_picked('icon.png', 'image/png', truncated)),
      throwsA(
        isA<AssistantAttachmentUploadException>().having(
          (error) => error.failure,
          'failure',
          AssistantAttachmentFailure.unsupported,
        ),
      ),
    );
  });

  test(
    'an encoder failure never uploads the original with its metadata',
    () async {
      const failing = AssistantMediaOptimizer(encoder: _NullEncoder());
      // Rotated, so lossless stripping cannot apply either.
      final rotated = _photo(width: 64, height: 48, orientation: 6);
      await expectLater(
        failing.optimize(_picked('photo.jpg', 'image/jpeg', rotated)),
        throwsA(
          isA<AssistantAttachmentUploadException>().having(
            (error) => error.failure,
            'failure',
            AssistantAttachmentFailure.unsupported,
          ),
        ),
      );
    },
  );

  test('a small JPEG keeps its pixels but loses its metadata', () async {
    final original = _photo(width: 64, height: 48, quality: 40);
    final result = await optimizer.optimize(
      _picked('tiny.jpg', 'image/jpeg', original),
    );

    final bytes = await result.result.file.readAsBytes();
    expect(bytes.length, lessThanOrEqualTo(original.length));
    expect(img.decodeJpg(bytes)!.exif.isEmpty, isTrue);
  });

  test('lossless stripping refuses rotated JPEGs', () {
    expect(stripJpegMetadataIfUpright(_photo(width: 8, height: 8)), isNotNull);
    expect(
      stripJpegMetadataIfUpright(_photo(width: 8, height: 8, orientation: 6)),
      isNull,
    );
  });

  test(
    'an undecodable HEIC fails as unsupported instead of uploading',
    () async {
      const failing = AssistantMediaOptimizer(encoder: _NullEncoder());
      await expectLater(
        failing.optimize(
          _picked('IMG.HEIC', 'image/heic', Uint8List.fromList([0, 1, 2])),
        ),
        throwsA(
          isA<AssistantAttachmentUploadException>().having(
            (error) => error.failure,
            'failure',
            AssistantAttachmentFailure.unsupported,
          ),
        ),
      );
    },
  );

  test('audio and documents upload unchanged', () async {
    final bytes = Uint8List.fromList(List.filled(32, 1));
    for (final (name, mime) in [
      ('voice-message.m4a', 'audio/mp4'),
      ('notes.pdf', 'application/pdf'),
    ]) {
      final result = await optimizer.optimize(_picked(name, mime, bytes));
      expect(result.result.name, name);
      expect(result.optimized, isFalse);
    }
  });

  test('voice notes record speech-optimal AAC-LC mono', () {
    expect(assistantVoiceRecordConfig.encoder, AudioEncoder.aacLc);
    expect(assistantVoiceRecordConfig.numChannels, 1);
    expect(assistantVoiceRecordConfig.sampleRate, 16000);
    expect(assistantVoiceRecordConfig.bitRate, 32000);
    // Two minutes at 32 kbps stays near 480 KB, far inside the upload cap.
    expect(120 * 32000 ~/ 8, lessThan(assistantMaxAttachmentBytes ~/ 50));
    expect(assistantMimeTypeFromExtension('m4a'), 'audio/mp4');
  });
}

/// Inserts well-formed ancillary chunks right after IHDR.
Uint8List _withPngChunks(Uint8List png, Map<String, Uint8List> chunks) {
  const ihdrEnd = 8 + 12 + 13;
  final out = BytesBuilder()..add(Uint8List.sublistView(png, 0, ihdrEnd));
  for (final MapEntry(key: type, value: data) in chunks.entries) {
    final header = ByteData(8)..setUint32(0, data.length);
    for (var i = 0; i < 4; i++) {
      header.setUint8(4 + i, type.codeUnitAt(i));
    }
    final crcInput = Uint8List.fromList([...type.codeUnits, ...data]);
    final crc = ByteData(4)..setUint32(0, _crc32(crcInput));
    out
      ..add(header.buffer.asUint8List())
      ..add(data)
      ..add(crc.buffer.asUint8List());
  }
  out.add(Uint8List.sublistView(png, ihdrEnd));
  return out.takeBytes();
}

/// A big-endian TIFF block whose GPS IFD records a latitude.
Uint8List _pngExifWithGps() {
  final exif = img.ExifData();
  exif.gpsIfd['GPSLatitude'] = img.IfdValueRational(10, 1);
  final out = img.OutputBuffer(bigEndian: true);
  exif.write(out);
  return out.getBytes();
}

List<String> _pngChunkTypes(Uint8List png) {
  final types = <String>[];
  var offset = 8;
  while (offset + 8 <= png.length) {
    final length = ByteData.sublistView(png, offset, offset + 4).getUint32(0);
    types.add(String.fromCharCodes(png.sublist(offset + 4, offset + 8)));
    offset += 12 + length;
  }
  return types;
}

int _crc32(List<int> bytes) {
  var crc = 0xffffffff;
  for (final byte in bytes) {
    crc ^= byte;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
    }
  }
  return crc ^ 0xffffffff;
}
