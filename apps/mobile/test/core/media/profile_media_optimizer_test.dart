import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/core/media/profile_media_optimizer.dart';

void main() {
  for (final kind in ProfileMediaKind.values) {
    test(
      '${kind.name} is optimized within its final byte and dimension limits',
      () async {
        final avatar = kind == ProfileMediaKind.avatar;
        final image = img.Image(
          width: avatar ? 800 : 1600,
          height: avatar ? 800 : 1000,
        );
        final random = Random(1);
        for (final pixel in image) {
          pixel.setRgb(
            random.nextInt(256),
            random.nextInt(256),
            random.nextInt(256),
          );
        }
        final input = img.encodePng(image);
        expect(input.length, greaterThan(avatar ? 1000000 : 2000000));
        final result = await optimizeProfileMediaBytes(input, kind: kind);
        expect(
          result.bytes.length,
          lessThanOrEqualTo(avatar ? 1000000 : 2000000),
        );
        final decoded = img.decodePng(result.bytes)!;
        expect(decoded.width, lessThanOrEqualTo(avatar ? 1024 : 2560));
        expect(decoded.height, lessThanOrEqualTo(avatar ? 1024 : 1440));
        expect(result.contentType, 'image/png');
        expect(result.filename, '${kind.name}.png');
      },
    );
  }
  test('orients and strips metadata', () async {
    final image = img.Image(width: 4, height: 2, numChannels: 4);
    image.exif.imageIfd.orientation = 6;
    final result = await optimizeProfileMediaBytes(img.encodeJpg(image));
    final decoded = img.decodePng(result.bytes)!;
    expect(decoded.width, 2);
    expect(decoded.height, 4);
    expect(decoded.exif.imageIfd.hasOrientation, isFalse);
  });
  test('preserves transparency', () async {
    final image = img.Image(width: 4, height: 2, numChannels: 4);
    final result = await optimizeProfileMediaBytes(img.encodePng(image));
    expect(img.decodePng(result.bytes)!.getPixel(0, 0).a, 0);
  });
  test('rejects corrupt or excessive source bytes', () async {
    await expectLater(
      optimizeProfileMediaBytes(Uint8List.fromList([1, 2, 3])),
      throwsFormatException,
    );
    await expectLater(
      optimizeProfileMediaBytes(Uint8List(2 * 1024 * 1024 + 1)),
      throwsFormatException,
    );
  });
}
