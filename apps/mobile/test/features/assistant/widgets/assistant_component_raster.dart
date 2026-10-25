import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> loadAssistantRenderFonts() async {
  for (final font in {
    'Roboto': 'assets/fonts/NotoSans.ttf',
    'NotoSans': 'assets/fonts/NotoSans.ttf',
    'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
    'LucideIcons': 'assets/fonts/lucide/LucideIcons.otf',
  }.entries) {
    await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
  }
}

void configureAssistantRaster(WidgetTester tester) {
  if (Platform.environment['ASSISTANT_EXPERIENCE_RENDER_DIR'] == null) return;
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const ui.Size(390, 844);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
}

Future<void> renderAssistantComponent(WidgetTester tester, String name) async {
  final directory = Platform.environment['ASSISTANT_EXPERIENCE_RENDER_DIR'];
  if (directory == null) return;
  await tester.runAsync(() async {
    await Directory(directory).create(recursive: true);
    final scene = tester.binding.renderViews.first.debugLayer!.buildScene(
      ui.SceneBuilder(),
    );
    final size = tester.view.physicalSize;
    final image = await scene.toImage(size.width.toInt(), size.height.toInt());
    scene.dispose();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$directory/$name.png',
    ).writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
