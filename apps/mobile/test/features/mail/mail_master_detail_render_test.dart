import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_page.dart';

import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

const _renderKey = ValueKey<String>('mail-master-detail-render');

/// Writes PNGs to MAIL_RENDER_DIR when set; otherwise only checks that each
/// layout renders without overflow or exceptions.
Future<void> _capture(WidgetTester tester, String name) async {
  final output = Platform.environment['MAIL_RENDER_DIR'];
  if (output == null) return;
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_renderKey),
    );
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(output).create(recursive: true);
    await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUpAll(() async {
    for (final family in ['NotoSans', 'Roboto']) {
      await (FontLoader(
        family,
      )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
    }
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });

  for (final brightness in Brightness.values) {
    for (final (device, size) in [
      ('phone', const Size(390, 844)),
      ('tablet-portrait', const Size(820, 1180)),
      ('tablet-landscape', const Size(1194, 834)),
    ]) {
      testWidgets('$device ${brightness.name} renders inbox and reader', (
        tester,
      ) async {
        setMailSurface(tester, size);
        final repository = MailPreviewRepository();
        stubMailPreview(repository, latency: Duration.zero);
        await tester.pumpThemedHome(
          MailWorkspace(workspaceId: 'ws', repository: repository),
          brightness: brightness,
          // Pushed phone readers live above the workspace route.
          wrap: (app) => RepaintBoundary(key: _renderKey, child: app),
        );
        await settleMail(tester);
        await _capture(tester, '$device-${brightness.name}-inbox');
        await tester.tap(find.text('Synthetic subject 1'));
        await tester.pumpAndSettle();
        await _capture(tester, '$device-${brightness.name}-reader');
        expect(tester.takeException(), isNull);
        await drain(tester);
      });
    }
  }
}
