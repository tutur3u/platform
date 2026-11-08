import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import '../../../helpers/golden_tolerance.dart';

Uint8List pixels(int changed, {int width = 100}) {
  final image = img.Image(width: width, height: 100);
  for (var i = 0; i < changed; i++) {
    image.setPixelRgb(i % width, i ~/ width, 255, 255, 255);
  }
  return Uint8List.fromList(img.encodePng(image));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory temp;
  late GoldenTolerance comparator;
  setUp(() async {
    temp = await Directory.systemTemp.createTemp('chart-tolerance-');
    comparator = GoldenTolerance(File('${temp.path}/test.dart').uri);
    await File('${temp.path}/reference.png').writeAsBytes(pixels(0));
  });
  tearDown(() async {
    await temp.delete(recursive: true);
  });
  test('accepts identical bytes and exactly 0.5% differing pixels', () async {
    expect(
      await comparator.compare(pixels(0), Uri.parse('reference.png')),
      isTrue,
    );
    expect(
      await comparator.compare(pixels(50), Uri.parse('reference.png')),
      isTrue,
    );
  });
  test('rejects 0.51% and emits the actual comparison artifacts', () async {
    await expectLater(
      comparator.compare(pixels(51), Uri.parse('reference.png')),
      throwsA(isA<FlutterError>()),
    );
    expect(Directory('${temp.path}/failures').listSync(), isNotEmpty);
  });
  test('rejects mismatched dimensions and missing references', () async {
    await expectLater(
      comparator.compare(pixels(0, width: 101), Uri.parse('reference.png')),
      throwsA(isA<FlutterError>()),
    );
    await expectLater(
      comparator.compare(pixels(0), Uri.parse('missing.png')),
      throwsA(isA<TestFailure>()),
    );
  });
}
