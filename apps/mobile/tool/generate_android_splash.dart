import 'dart:io';

import 'package:flutter_native_splash/cli_commands.dart';
import 'package:image/image.dart' as image;

/// Run from apps/mobile. Pads unchanged artwork, then generates Android only.
void main() {
  final source = image.decodePng(
    File('assets/logos/transparent.png').readAsBytesSync(),
  )!;
  if (source.width != 320 || source.height != 320) {
    throw StateError('Expected canonical 320px transparent artwork');
  }
  for (final entry in {
    'transparent_android_splash.png': 768,
    'transparent_android12_splash.png': 1152,
  }.entries) {
    final size = entry.value;
    final padded = image.compositeImage(
      image.Image(width: size, height: size, numChannels: 4),
      source,
      center: true,
      blend: image.BlendMode.direct,
    );
    final offset = (size - source.width) ~/ 2;
    for (final pixel in source) {
      final copy = padded.getPixel(pixel.x + offset, pixel.y + offset);
      if (copy.r != pixel.r ||
          copy.g != pixel.g ||
          copy.b != pixel.b ||
          copy.a != pixel.a) {
        throw StateError('Canonical artwork changed while padding');
      }
    }
    File('assets/logos/${entry.key}').writeAsBytesSync(image.encodePng(padded));
  }

  final config = File('flutter_native_splash.yaml').readAsStringSync();
  final iosEnabled = RegExp(r'^  ios: true$', multiLine: true);
  if (!iosEnabled.hasMatch(config) || !config.contains('  web: false')) {
    throw StateError('Expected canonical iOS/web configuration');
  }
  final temporary = Directory.systemTemp.createTempSync('android-splash-');
  try {
    final androidOnly = File('${temporary.path}/flutter_native_splash.yaml')
      ..writeAsStringSync(config.replaceFirst(iosEnabled, '  ios: false'));
    createSplash(path: androidOnly.path, flavor: null);
  } finally {
    temporary.deleteSync(recursive: true);
  }
}
