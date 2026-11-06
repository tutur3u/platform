import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

/// At most 0.5% differing pixels; dimensions and missing references still fail.
class GoldenTolerance extends LocalFileComparator {
  GoldenTolerance(super.testFile);
  static const maxDifferentPixels = 0.005;

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    final result = await GoldenFileComparator.compareLists(
      imageBytes,
      await getGoldenBytes(golden),
    );
    try {
      if (result.passed || result.diffPercent <= maxDifferentPixels) {
        return true;
      }
      final failure = await generateFailureOutput(result, golden, basedir);
      throw FlutterError(failure);
    } finally {
      result.dispose();
    }
  }
}
