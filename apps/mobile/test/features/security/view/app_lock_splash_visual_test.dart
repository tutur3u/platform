import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/view/app_lock_gate.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_splash_surface.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('padded generator inputs preserve canonical RGBA artwork', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final codec = await ui.instantiateImageCodec(
        File('assets/logos/transparent.png').readAsBytesSync(),
      );
      final canonical = (await codec.getNextFrame()).image;
      final expected = (await canonical.toByteData())!.buffer.asUint8List();
      expect(canonical.width, 320);
      expect(canonical.height, 320);
      for (final entry in {
        'transparent_android_splash.png': 224,
        'transparent_android12_splash.png': 416,
      }.entries) {
        final paddedCodec = await ui.instantiateImageCodec(
          File('assets/logos/${entry.key}').readAsBytesSync(),
        );
        final padded = (await paddedCodec.getNextFrame()).image;
        final actual = (await padded.toByteData())!.buffer.asUint8List();
        expect(await _pixel(padded, 0, 0), 0);
        for (var y = 0; y < 320; y++) {
          final start = ((y + entry.value) * padded.width + entry.value) * 4;
          expect(
            actual.sublist(start, start + 320 * 4),
            expected.sublist(y * 320 * 4, (y + 1) * 320 * 4),
            reason: '${entry.key} canonical row $y',
          );
        }
        padded.dispose();
        paddedCodec.dispose();
      }
      canonical.dispose();
      codec.dispose();
    });
  });
  testWidgets('Android generated densities preserve the 80dp artwork', (
    tester,
  ) async {
    await tester.runAsync(() async {
      for (final density in {
        'mdpi': 1.0,
        'hdpi': 1.5,
        'xhdpi': 2.0,
        'xxhdpi': 3.0,
        'xxxhdpi': 4.0,
      }.entries) {
        for (final night in ['', 'night-']) {
          for (final name in ['splash', 'android12splash']) {
            final path =
                'android/app/src/main/res/'
                'drawable-$night${density.key}/$name.png';
            final codec = await ui.instantiateImageCodec(
              File(path).readAsBytesSync(),
            );
            final image = (await codec.getNextFrame()).image;
            final bounds = await _artworkBounds(image);
            expect((await _pixel(image, 0, 0)) >> 24, 0, reason: path);
            expect(bounds.width / density.value, 80, reason: path);
            expect(bounds.height / density.value, 80, reason: path);
            expect(
              bounds.center,
              Offset(image.width / 2, image.height / 2),
              reason: path,
            );
            image.dispose();
            codec.dispose();
          }
        }
      }
    });
  });
  for (final nativeSurface in ['ios', 'android', 'android12']) {
    final platform = nativeSurface == 'ios'
        ? TargetPlatform.iOS
        : TargetPlatform.android;
    for (final dark in [false, true]) {
      for (final compactHeight in [null, 568.0, 600.0, 640.0]) {
        final compact = compactHeight != null;
        final viewportLabel = compact
            ? 'compact-${compactHeight.toInt()}-vi-2x'
            : 'regular-en-1x';
        final label =
            '$nativeSurface-${dark ? 'dark' : 'light'}-$viewportLabel';
        testWidgets('native artwork and lock raster parity $label', (
          tester,
        ) async {
          debugDefaultTargetPlatformOverride = platform;
          addTearDown(() => debugDefaultTargetPlatformOverride = null);
          final size = compact
              ? Size(320, compactHeight)
              : const Size(390, 844);
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final font = FontLoader('NotoSans')
            ..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'));
          await font.load();
          final nativePath = platform == TargetPlatform.iOS
              ? 'ios/Runner/Assets.xcassets/LaunchImage.imageset/'
                    '${dark ? 'LaunchImageDark' : 'LaunchImage'}.png'
              : 'android/app/src/main/res/drawable-'
                    '${dark ? 'night-' : ''}mdpi/${nativeSurface == 'android12' ? 'android12splash' : 'splash'}.png';
          final nativeBytes = File(nativePath).readAsBytesSync();
          final codec = (await tester.runAsync(
            () => ui.instantiateImageCodec(nativeBytes),
          ))!;
          final nativeImage = (await tester.runAsync(
            codec.getNextFrame,
          ))!.image;
          final nativeBounds = await tester.runAsync(
            () => _artworkBounds(nativeImage),
          );
          // Actual generated assets, not their larger padded generator inputs.
          expect(
            nativeBounds!.width,
            platform == TargetPlatform.iOS ? 104 : 80,
          );
          final nativeSize = Size(
            nativeImage.width.toDouble(),
            nativeImage.height.toDouble(),
          );
          nativeImage.dispose();
          codec.dispose();
          final key = GlobalKey();
          final expectedBackground = dark
              ? const Color(0xFF09090B)
              : const Color(0xFFFFFFFF);
          Future<void> show(Widget child) async {
            await tester.pumpApp(
              shad.Theme(
                data: dark
                    ? shad.ThemeData.dark(
                        colorScheme: shad.ColorSchemes.darkZinc,
                        typography: const shad.Typography.geist().copyWith(
                          sans: () => const TextStyle(fontFamily: 'NotoSans'),
                        ),
                      )
                    : shad.ThemeData(
                        colorScheme: shad.ColorSchemes.lightZinc,
                        typography: const shad.Typography.geist().copyWith(
                          sans: () => const TextStyle(fontFamily: 'NotoSans'),
                        ),
                      ),
                child: Builder(
                  builder: (context) => Localizations.override(
                    context: context,
                    locale: Locale(compact ? 'vi' : 'en'),
                    child: MediaQuery(
                      data: MediaQuery.of(context).copyWith(
                        textScaler: TextScaler.linear(compact ? 2 : 1),
                        disableAnimations: true,
                      ),
                      child: DefaultTextStyle(
                        style: TextStyle(
                          fontFamily: 'NotoSans',
                          fontSize: 14,
                          color: dark ? Colors.white : Colors.black,
                        ),
                        child: RepaintBoundary(key: key, child: child),
                      ),
                    ),
                  ),
                ),
              ),
            );
            await tester.runAsync(() async {
              await precacheImage(
                MemoryImage(nativeBytes),
                key.currentContext!,
              );
            });
            await tester.pump();
          }

          // Reconstruct native center/content-mode geometry from checked-in PNGs.
          // This is deliberately not an installed-device launch screenshot.
          await show(
            ColoredBox(
              color: expectedBackground,
              child: Center(
                child: Image.memory(
                  nativeBytes,
                  width: nativeSize.width,
                  height: nativeSize.height,
                ),
              ),
            ),
          );
          final native = await _capture(tester, key, '$label-native-fixture');
          final expectedBounds = await tester.runAsync(
            () => _artworkBounds(native),
          );
          native.dispose();
          await show(const AppSplashSurface());
          await tester.runAsync(() async {
            await precacheImage(
              tester.widget<Image>(find.byType(Image)).image,
              key.currentContext!,
            );
          });
          await tester.pump();
          final splash = await _capture(tester, key, '$label-flutter-splash');
          final splashBounds = await tester.runAsync(
            () => _artworkBounds(splash),
          );
          final splashBackground = await tester.runAsync(
            () => _pixel(splash, 0, 0),
          );
          splash.dispose();
          var attempts = 0;
          await show(
            AppLockGate(authenticating: false, onUnlock: () => attempts++),
          );
          final lock = await _capture(tester, key, '$label-lock-entry');
          final lockBounds = await tester.runAsync(() => _artworkBounds(lock));
          final lockBackground = await tester.runAsync(
            () => _pixel(lock, 0, 0),
          );
          lock.dispose();
          await tester.pump(const Duration(seconds: 5));
          final recovery = await _capture(tester, key, '$label-lock-recovery');
          final recoveryBounds = (await tester.runAsync(
            () => _artworkBounds(recovery),
          ))!;
          recovery.dispose();
          final description = find.text(
            key.currentContext!.l10n.appLockLockedDescription,
          );
          expect(
            recoveryBounds.bottom + 12,
            lessThanOrEqualTo(tester.getRect(description).top),
          );
          final button = find.byKey(const ValueKey('app-lock-unlock-button'));
          expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
          await tester.ensureVisible(button);
          await tester.tap(button);
          expect(attempts, 1);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
          debugDefaultTargetPlatformOverride = null;
          expect(splashBackground, expectedBackground.toARGB32());
          expect(lockBackground, expectedBackground.toARGB32());
          expect(splashBounds, expectedBounds);
          expect(lockBounds, expectedBounds);
          expect(
            expectedBounds!.center,
            Offset(size.width / 2, size.height / 2),
          );
        });
      }
    }
  }
}

Future<ui.Image> _capture(
  WidgetTester tester,
  GlobalKey key,
  String label,
) async {
  return (await tester.runAsync(() async {
    final image =
        await (key.currentContext!.findRenderObject()! as RenderRepaintBoundary)
            .toImage();
    final output = Platform.environment['LOCK_SPLASH_RASTERS'];
    if (output != null) {
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final file = File('$output/$label.png');
      await file.parent.create(recursive: true);
      await file.writeAsBytes(png!.buffer.asUint8List());
    }
    return image;
  }))!;
}

Future<int> _pixel(ui.Image image, int x, int y) async {
  final bytes = (await image.toByteData())!;
  final index = (y * image.width + x) * 4;
  return Color.fromARGB(
    bytes.getUint8(index + 3),
    bytes.getUint8(index),
    bytes.getUint8(index + 1),
    bytes.getUint8(index + 2),
  ).toARGB32();
}

Future<Rect> _artworkBounds(ui.Image image) async {
  final bytes = (await image.toByteData())!.buffer.asUint8List();
  return _coloredBounds(bytes, image.width, image.height);
}

Rect _coloredBounds(Uint8List bytes, int width, int height) {
  var left = width;
  var top = height;
  var right = -1;
  var bottom = -1;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      final i = (y * width + x) * 4;
      final rgb = [bytes[i], bytes[i + 1], bytes[i + 2]]..sort();
      if (bytes[i + 3] > 128 && rgb.last - rgb.first > 40) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return Rect.fromLTRB(
    left.toDouble(),
    top.toDouble(),
    (right + 1).toDouble(),
    (bottom + 1).toDouble(),
  );
}
