import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image;
import 'package:mobile/data/repositories/profile_media_optimization.dart';

void main() {
  test('avatar resizes large input and strips metadata into bounded JPEG', () {
    final source = image.Image(width: 1800, height: 900);
    final bytes = optimizeProfileMediaBytes((
      bytes: image.encodePng(source),
      banner: false,
    ));
    final result = image.decodeJpg(bytes)!;
    expect(result.width, 1024);
    expect(result.height, 512);
    expect(bytes.length, lessThan(2 * 1024 * 1024));
  });
  test('banner preserves full aspect ratio and independent larger bound', () {
    final source = image.Image(width: 2400, height: 800);
    final result = image.decodeJpg(
      optimizeProfileMediaBytes((bytes: image.encodePng(source), banner: true)),
    )!;
    expect(result.width, 2048);
    expect(result.height, 683);
  });
  test('rejects corrupt and oversized input before upload', () {
    expect(
      () => optimizeProfileMediaBytes((bytes: Uint8List(3), banner: false)),
      throwsFormatException,
    );
    expect(
      () => optimizeProfileMediaBytes((
        bytes: Uint8List(20 * 1024 * 1024 + 1),
        banner: true,
      )),
      throwsFormatException,
    );
  });
}
