import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/core/media/profile_media_optimizer.dart';

import '../../helpers/profile_media_fixtures.dart';

void main() {
  test(
    'phone JPEG retains recommended resolution in a compact upload',
    () async {
      final input = phonePhoto();
      expect(input.length, greaterThan(2000000));
      for (final kind in ProfileMediaKind.values) {
        final result = await optimizeProfileMediaBytes(input, kind: kind);
        expect(result.contentType, 'image/jpeg');
        final decoded = img.decodeJpg(result.bytes)!;
        expect(decoded.width, kind == ProfileMediaKind.avatar ? 1024 : 1920);
        expect(
          result.bytes.length,
          lessThanOrEqualTo(
            kind == ProfileMediaKind.avatar ? 1000000 : 2000000,
          ),
        );
      }
    },
  );
  test('empty input is invalid image rather than too large', () async {
    try {
      await optimizeProfileMediaBytes(Uint8List(0));
      fail('empty image accepted');
    } on FormatException catch (error) {
      expect(error, isNot(isA<ProfileMediaSizeException>()));
    }
  });
  for (final kind in ProfileMediaKind.values) {
    test('${kind.name} compresses a source above its upload limit', () async {
      final avatar = kind == ProfileMediaKind.avatar;
      final image = img.Image(
        width: avatar ? 1100 : 1700,
        height: avatar ? 1000 : 1300,
      );
      final random = Random(11);
      for (final pixel in image) {
        pixel.setRgb(
          random.nextInt(256),
          random.nextInt(256),
          random.nextInt(256),
        );
      }
      final input = img.encodePng(image);
      expect(input.length, greaterThan((avatar ? 2 : 5) * 1024 * 1024));
      final directory = await Directory.systemTemp.createTemp(
        'profile-optimizer-test-',
      );
      try {
        final file = await File(
          '${directory.path}/source.png',
        ).writeAsBytes(input);
        final output = await optimizeProfileMediaFile(file, kind: kind);
        expect(
          output.bytes.length,
          lessThanOrEqualTo(avatar ? 1000000 : 2000000),
        );
        final decoded = img.decodeImage(output.bytes)!;
        expect(
          decoded.width,
          inInclusiveRange(avatar ? 512 : 1024, avatar ? 1024 : 1700),
        );
        expect(
          decoded.width / decoded.height,
          closeTo((avatar ? 1100 : 1700) / (avatar ? 1000 : 1300), 0.01),
        );
        final fromBytes = await optimizeProfileMediaBytes(input, kind: kind);
        expect(fromBytes.bytes, output.bytes);
      } finally {
        await directory.delete(recursive: true);
      }
    });
  }

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
        final decoded = img.decodeImage(result.bytes)!;
        expect(decoded.width, avatar ? 800 : 1600);
        expect(decoded.height, avatar ? 800 : 1000);
        expect(result.contentType, 'image/jpeg');
        expect(result.filename, '${kind.name}.jpg');
      },
    );
  }
  test('tiny opaque image stays tiny and is encoded as JPEG', () async {
    final result = await optimizeProfileMediaBytes(
      img.encodePng(img.Image(width: 2, height: 3)),
    );
    expect(result.contentType, 'image/jpeg');
    final decoded = img.decodeJpg(result.bytes)!;
    expect((decoded.width, decoded.height), (2, 3));
  });
  test('panorama banner preserves aspect within the server canvas', () async {
    final result = await optimizeProfileMediaBytes(
      img.encodeJpg(img.Image(width: 6000, height: 1000)),
      kind: ProfileMediaKind.banner,
    );
    final decoded = img.decodeJpg(result.bytes)!;
    expect((decoded.width, decoded.height), (2560, 427));
    expect(result.bytes.length, lessThanOrEqualTo(2000000));
  });
  test(
    'decodable source above 20 MiB is optimized rather than rejected',
    () async {
      final jpg = img.encodeJpg(img.Image(width: 32, height: 32));
      final input = Uint8List(24 * 1024 * 1024)..setAll(0, jpg);
      final result = await optimizeProfileMediaBytes(input);
      expect(img.decodeJpg(result.bytes)!.width, 32);
      expect(result.bytes.length, lessThanOrEqualTo(1000000));
    },
  );
  test('orients and strips metadata', () async {
    final image = img.Image(width: 4, height: 2, numChannels: 4);
    image.exif.imageIfd.orientation = 6;
    final result = await optimizeProfileMediaBytes(img.encodeJpg(image));
    final decoded = img.decodeImage(result.bytes)!;
    expect(decoded.width, 2);
    expect(decoded.height, 4);
    expect(decoded.exif.imageIfd.hasOrientation, isFalse);
  });
  test('preserves transparency', () async {
    final image = img.Image(width: 4, height: 2, numChannels: 4);
    final result = await optimizeProfileMediaBytes(img.encodePng(image));
    expect(img.decodeImage(result.bytes)!.getPixel(0, 0).a, 0);
  });
  for (final kind in ProfileMediaKind.values) {
    test(
      '${kind.name} rejects oversized files before reading their bytes',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'profile-input-limit-',
        );
        try {
          final file = File('${directory.path}/oversized.png');
          final handle = await file.open(mode: FileMode.write);
          await handle.truncate(profileMediaSourceByteLimit + 1);
          await handle.close();
          await expectLater(
            optimizeProfileMediaFile(file, kind: kind),
            throwsA(isA<ProfileMediaSizeException>()),
          );
        } finally {
          await directory.delete(recursive: true);
        }
      },
    );
  }
  test('rejects corrupt or excessive source bytes', () async {
    await expectLater(
      optimizeProfileMediaBytes(Uint8List.fromList([1, 2, 3])),
      throwsFormatException,
    );
    await expectLater(
      optimizeProfileMediaBytes(Uint8List(profileMediaSourceByteLimit + 1)),
      throwsFormatException,
    );
  });
}
