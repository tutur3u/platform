import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as raster;
import 'package:integration_test/integration_test.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';

import 'mail_html_layout_fixtures.dart';

/// Native WebView layout proof on an Android or iOS test device.
/// Sender JavaScript stays disabled. Native snapshots measure a fixture-only
/// paragraph background, so measurement needs no DOM script execution.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  for (final width in [320.0, 390.0]) {
    for (final fixture in mailHtmlLayoutFixtures()) {
      testWidgets(
        '${fixture.name} retains a readable column at ${width.toInt()}px',
        (tester) async {
          expect(
            Platform.isAndroid || Platform.isIOS,
            isTrue,
            reason: 'This suite requires a real Android/iOS WebView runtime.',
          );
          await binding.setSurfaceSize(Size(width, 900));
          addTearDown(() => binding.setSurfaceSize(null));
          final ready = Completer<InAppWebViewController>();
          const fixedControl = bool.fromEnvironment(
            'MAIL_LAYOUT_FIXED_CONTROL',
          );
          final rendered = buildMailHtmlDocument(
            fixture.html,
            loadImages: false,
            inlineImages: const {'layout-logo': mailLayoutLogoDataUri},
          );
          final document = fixedControl
              ? rendered.replaceAll('table-layout:auto', 'table-layout:fixed')
              : rendered;
          expect(document, contains("script-src 'none'"));
          expect(document, contains('data-mail-preview="original"'));
          await tester.pumpWidget(
            MaterialApp(
              theme: const bool.fromEnvironment('MAIL_LAYOUT_LIGHT_APP')
                  ? ThemeData.light()
                  : ThemeData.dark(),
              home: Scaffold(
                body: SafeArea(
                  child: InAppWebView(
                    key: ValueKey('${fixture.name}-$width'),
                    initialSettings: InAppWebViewSettings(
                      transparentBackground: true,
                      javaScriptEnabled: false,
                      incognito: true,
                      allowFileAccess: false,
                      allowContentAccess: false,
                      useShouldOverrideUrlLoading: true,
                    ),
                    initialData: InAppWebViewInitialData(
                      baseUrl: WebUri('about:blank'),
                      data: document,
                    ),
                    onLoadStop: (controller, _) {
                      if (!ready.isCompleted) ready.complete(controller);
                    },
                    shouldOverrideUrlLoading: (_, action) async =>
                        action.isForMainFrame &&
                            action.request.url?.toString() == 'about:blank'
                        ? NavigationActionPolicy.ALLOW
                        : NavigationActionPolicy.CANCEL,
                  ),
                ),
              ),
            ),
          );
          await tester.pump();
          final controller = await tester.runAsync(
            () => ready.future.timeout(const Duration(seconds: 40)),
          );
          expect(controller, isNotNull);
          await tester.pumpAndSettle();
          final settings = await tester.runAsync(controller!.getSettings);
          expect(settings?.javaScriptEnabled, isFalse);
          const externalCapture = bool.fromEnvironment(
            'MAIL_LAYOUT_EXTERNAL_CAPTURE',
          );
          if (externalCapture) {
            debugPrint(
              'MAIL_LAYOUT_VISUAL_READY ${fixture.name} '
              'width=$width fixed=$fixedControl',
            );
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(seconds: 30)),
            );
            fail('External capture diagnostic: no in-WebView assertion pass');
          }
          Map<String, double>? metrics;
          for (var frame = 0; frame < 6; frame++) {
            await tester.pump(const Duration(milliseconds: 100));
            final bytes = await tester.runAsync(controller.takeScreenshot);
            expect(
              bytes,
              isNotNull,
              reason: 'Native WebView snapshot required',
            );
            final image = raster.decodeImage(bytes!);
            expect(image, isNotNull, reason: 'Native snapshot must decode');
            metrics = _measurePixels(image!);
            if (metrics['darkLogoWidthRatio']! >= 80 / width) break;
          }
          final measured = metrics!;
          final context = '${fixture.name} / $width: $measured';
          expect(
            measured['copyWidthRatio'],
            greaterThanOrEqualTo(.55),
            reason: context,
          );
          expect(measured['paperRatio'], greaterThan(.5), reason: context);
          expect(
            measured['darkLogoWidthRatio'],
            greaterThanOrEqualTo(80 / width),
            reason: context,
          );
          debugPrint('MAIL_LAYOUT_NATIVE ${jsonEncode(measured)}');
          const hold = bool.fromEnvironment('MAIL_LAYOUT_SCREENSHOT_HOLD');
          if (hold && fixture.name == mailHtmlLayoutFixtures().first.name) {
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(seconds: 30)),
            );
          }
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          expect(tester.takeException(), isNull);
        },
        timeout: const Timeout(Duration(minutes: 2)),
      );
    }
  }
}

Map<String, double> _measurePixels(raster.Image image) {
  var widestCopy = 0;
  var widestDark = 0;
  var white = 0;
  for (var y = 0; y < image.height; y++) {
    var copyRun = 0;
    var darkRun = 0;
    for (var x = 0; x < image.width; x++) {
      final pixel = image.getPixel(x, y);
      final copy =
          (pixel.r - 226).abs() <= 2 &&
          (pixel.g - 240).abs() <= 2 &&
          (pixel.b - 255).abs() <= 2;
      final dark =
          (pixel.r - 23).abs() <= 2 &&
          (pixel.g - 23).abs() <= 2 &&
          (pixel.b - 23).abs() <= 2;
      copyRun = copy ? copyRun + 1 : 0;
      darkRun = dark ? darkRun + 1 : 0;
      if (copyRun > widestCopy) widestCopy = copyRun;
      if (darkRun > widestDark) widestDark = darkRun;
      if (pixel.r >= 250 && pixel.g >= 250 && pixel.b >= 250) white++;
    }
  }
  return {
    'copyWidthRatio': widestCopy / image.width,
    'darkLogoWidthRatio': widestDark / image.width,
    'paperRatio': white / (image.width * image.height),
  };
}
