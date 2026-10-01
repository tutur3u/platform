import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_browser.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

ProfileTimelineItem _item(String title, DateTime date) => ProfileTimelineItem(
  id: title,
  type: 'task',
  createdAt: date,
  scope: 'personal',
  title: title,
);

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final font = Platform.environment['TIMELINE_MATERIAL_FONT'];
    if (font != null) {
      final loader = FontLoader('Roboto')
        ..addFont(File(font).readAsBytes().then(ByteData.sublistView));
      await loader.load();
    }
    final manifest =
        jsonDecode(await rootBundle.loadString('FontManifest.json'))
            as List<dynamic>;
    for (final entry in manifest.cast<Map<String, dynamic>>()) {
      final loader = FontLoader(entry['family'] as String);
      for (final font
          in (entry['fonts'] as List<dynamic>).cast<Map<String, dynamic>>()) {
        loader.addFont(rootBundle.load(font['asset'] as String));
      }
      await loader.load();
    }
  });

  testWidgets(
    'older selected day expands agenda page and preserves visible item',
    (tester) async {
      final items = [
        for (var i = 0; i < 6; i++)
          _item('New $i', DateTime(2026, 10, 1, 12, -i)),
        for (var i = 0; i < 12; i++)
          _item('Old $i', DateTime(2026, 9, 28, 12, -i)),
      ];
      await tester.pumpApp(
        ProfileTimelineBrowser(
          items: items,
          now: DateTime(2026, 10, 1, 12),
          pageSize: 1,
          onOpen: (_) {},
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Old 0'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('timeline-date-toggle')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(
          ValueKey('timeline-date-${DateTime(2026, 9, 28).toIso8601String()}'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -240),
      );
      await tester.pumpAndSettle();
      final before = tester.getTopLeft(find.text('Old 3')).dy;
      for (var i = 0; i < 4; i++) {
        await tester.tap(find.byKey(const ValueKey('timeline-date-toggle')));
        await tester.pumpAndSettle();
        expect(tester.getTopLeft(find.text('Old 3')).dy, closeTo(before, .01));
      }
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('320px 3x modes render and capture without overflow', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpApp(
      shad.Theme(
        data: MobileShadTheme.light,
        child: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(3)),
            child: RepaintBoundary(
              key: const ValueKey('edge-capture'),
              child: DefaultTextStyle.merge(
                style: const TextStyle(fontFamily: 'Roboto'),
                child: ColoredBox(
                  color: MobileShadTheme.light.colorScheme.background,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: ProfileTimelineBrowser(
                      items: [_item('Task', DateTime(2026, 10, 1, 10))],
                      now: DateTime(2026, 10, 1, 12),
                      onOpen: (_) {},
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final initial = tester.getRect(
      find.byKey(const ValueKey('timeline-browser')),
    );
    Future<void> capture(String name) async {
      final output = Platform.environment['TIMELINE_RENDER_DIR'];
      if (output == null) return;
      await tester.pump(const Duration(milliseconds: 200));
      final title = tester.getRect(find.text('Task'));
      await tester
          .runAsync(() async {
            final boundary = tester.renderObject<RenderRepaintBoundary>(
              find.byKey(const ValueKey('edge-capture')),
            );
            final image = await boundary.toImage();
            try {
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              final codec = await ui.instantiateImageCodec(
                bytes!.buffer.asUint8List(),
              );
              final frame = await codec.getNextFrame();
              var ink = 0;
              try {
                final pixels = await frame.image.toByteData();
                for (var y = title.top.floor(); y < title.bottom.ceil(); y++) {
                  for (
                    var x = title.left.floor();
                    x < title.right.ceil();
                    x++
                  ) {
                    final offset = (y * frame.image.width + x) * 4;
                    if (pixels!.getUint8(offset) < 100 &&
                        pixels.getUint8(offset + 1) < 100 &&
                        pixels.getUint8(offset + 2) < 100 &&
                        pixels.getUint8(offset + 3) > 200) {
                      ink++;
                    }
                  }
                }
              } finally {
                frame.image.dispose();
                codec.dispose();
              }
              final directory = Directory(output)..createSync(recursive: true);
              await File(
                '${directory.path}/$name.png',
              ).writeAsBytes(bytes.buffer.asUint8List());
              await File('${directory.path}/$name.json').writeAsString(
                jsonEncode({
                  'synthetic': true,
                  'width': 320,
                  'scale': 3,
                  'titleBounds': title.toString(),
                  'titleInkPixels': ink,
                }),
              );
              expect(ink, greaterThan(20), reason: 'Saved PNG must paint Task');
            } finally {
              image.dispose();
            }
          })
          .timeout(const Duration(seconds: 10));
    }

    await capture('320-3x-agenda');
    await tester.tap(find.byKey(const ValueKey('timeline-date-toggle')));
    await tester.pumpAndSettle();
    expect(
      tester.getRect(find.byKey(const ValueKey('timeline-browser'))),
      initial,
    );
    expect(find.text('Task'), findsOneWidget);
    await capture('320-3x-selected-day');
    expect(tester.takeException(), isNull);
  });
}
