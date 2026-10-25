import 'dart:math';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

Uint8List phonePhoto() {
  final source = img.Image(width: 4032, height: 3024);
  final random = Random(42);
  for (final pixel in source) {
    final noise = random.nextInt(80);
    pixel.setRgb(
      (pixel.x * 13 + noise) % 256,
      (pixel.y * 7 + noise) % 256,
      (pixel.x + pixel.y + noise) % 256,
    );
  }
  return img.encodeJpg(source, quality: 88);
}
