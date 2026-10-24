import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';

const _ratio = 4.0; // 24px icons rasterised at 96px.
const _grid = Key('lucide-grid');

typedef _Sample = ({String name, String dartName, int codepoint, String svg});

Map<String, List<_Sample>> _samples() {
  final json =
      jsonDecode(
            File('test/fixtures/lucide/parity_samples.json').readAsStringSync(),
          )
          as Map<String, dynamic>;
  return json.map(
    (kind, list) => MapEntry(kind, [
      for (final item in (list as List).cast<Map<String, dynamic>>())
        (
          name: item['name'] as String,
          dartName: item['dartName'] as String,
          codepoint: item['codepoint'] as int,
          svg: item['svg'] as String,
        ),
    ]),
  );
}

// The generated constants for the fixture samples (const, as icon
// tree-shaking requires); the test checks they match the fixture.
const _icons = {
  'base': <String, IconData>{
    'house': LucideIcons.house,
    'search': LucideIcons.search,
    'x': LucideIcons.x,
    'check': LucideIcons.check,
    'settings': LucideIcons.settings,
    'bell': LucideIcons.bell,
    'calendar': LucideIcons.calendar,
    'user': LucideIcons.user,
    'earth': LucideIcons.earth,
    'chevron-right': LucideIcons.chevronRight,
    'trash': LucideIcons.trash,
    'circle-alert': LucideIcons.circleAlert,
    'ellipsis': LucideIcons.ellipsis,
    'grip-vertical': LucideIcons.gripVertical,
    'loader-circle': LucideIcons.loaderCircle,
    'star': LucideIcons.star,
  },
  'lab': <String, IconData>{
    'apple-core': LucideLabIcons.appleCore,
    'ampersand-square': LucideLabIcons.ampersandSquare,
    'arrows-up-down-square': LucideLabIcons.arrowsUpDownSquare,
    'bottle-champagne': LucideLabIcons.bottleChampagne,
    'cat-big': LucideLabIcons.catBig,
    'burger': LucideLabIcons.burger,
    'flower-lotus': LucideLabIcons.flowerLotus,
    'hat-top': LucideLabIcons.hatTop,
  },
};

/// Alpha coverage of the web SVG, drawn by flutter_svg at 24px * ratio.
Future<Uint8List> _webCoverage(String svg) async {
  final info = await vg.loadPicture(SvgStringLoader(svg), null);
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder)
    ..scale(_ratio)
    ..drawPicture(info.picture);
  final size = (24 * _ratio).round();
  final image = await recorder.endRecording().toImage(size, size);
  info.picture.dispose();
  return await _alpha(image);
}

Future<Uint8List> _alpha(ui.Image image) async {
  final rgba = (await image.toByteData())!.buffer.asUint8List();
  image.dispose();
  return Uint8List.fromList([for (var i = 3; i < rgba.length; i += 4) rgba[i]]);
}

/// What a viewer compares: shape overlap (IoU of the half-coverage masks),
/// placement (ink centroid offset in device pixels) and stroke weight (ink
/// ratio). Exact per-glyph geometry is gated at 1% by the generator; text and
/// vector rasterisers anti-alias edges differently, so pixel equality is not
/// the right measure here.
({double iou, double offset, double weight}) _compare(
  Uint8List web,
  Uint8List glyph,
) {
  var both = 0;
  var either = 0;
  var wx = 0.0;
  var wy = 0.0;
  var ws = 0.0;
  var gx = 0.0;
  var gy = 0.0;
  var gs = 0.0;
  const side = 96;
  for (var i = 0; i < web.length; i++) {
    final a = web[i] > 128;
    final b = glyph[i] > 128;
    if (a && b) both++;
    if (a || b) either++;
    final x = i % side;
    final y = i ~/ side;
    wx += x * web[i];
    wy += y * web[i];
    ws += web[i];
    gx += x * glyph[i];
    gy += y * glyph[i];
    gs += glyph[i];
  }
  final dx = wx / ws - gx / gs;
  final dy = wy / ws - gy / gs;
  return (
    iou: either == 0 ? 0 : both / either,
    offset: (dx * dx + dy * dy) == 0 ? 0 : math.sqrt(dx * dx + dy * dy),
    weight: gs / ws,
  );
}

Widget _gridRow(_Sample sample, String kind, Color ink, Color muted) => Row(
  children: [
    SizedBox(
      width: 168,
      child: Text(
        sample.name,
        style: TextStyle(fontSize: 11, color: muted, fontFamily: 'NotoSans'),
      ),
    ),
    SizedBox.square(
      dimension: 24,
      child: SvgPicture.string(sample.svg, theme: SvgTheme(currentColor: ink)),
    ),
    const SizedBox(width: 16),
    Icon(_icons[kind]![sample.name], size: 24, color: ink),
  ],
);

void main() {
  setUpAll(() async {
    for (final (family, asset) in [
      (LucideIcons.fontFamily, 'assets/fonts/lucide/LucideIcons.otf'),
      (LucideLabIcons.fontFamily, 'assets/fonts/lucide/LucideLabIcons.otf'),
      ('NotoSans', 'assets/fonts/NotoSans.ttf'),
    ]) {
      await (FontLoader(family)..addFont(rootBundle.load(asset))).load();
    }
  });

  test('generated classes cover every icon in the manifest', () {
    final manifest =
        jsonDecode(
              File(
                'lib/core/ui/icons/generated/lucide_manifest.json',
              ).readAsStringSync(),
            )
            as Map<String, dynamic>;
    final sets = manifest['sets'] as Map<String, dynamic>;
    for (final (kind, file) in [
      ('base', 'lucide_icons.g.dart'),
      ('lab', 'lucide_lab_icons.g.dart'),
    ]) {
      final source = File(
        'lib/core/ui/icons/generated/$file',
      ).readAsStringSync();
      final glyphs = RegExp(r'= IconData\(\s*0x').allMatches(source).length;
      final set = sets[kind] as Map<String, dynamic>;
      expect(glyphs, set['icons'], reason: kind);
    }
    expect((sets['base'] as Map)['icons'], 1903);
    expect((sets['lab'] as Map)['icons'], 357);
    // Web names and aliases resolve to the same glyph.
    expect(LucideIcons.home, LucideIcons.house);
    expect(LucideLabIcons.appleCore.fontFamily, 'LucideLabIcons');
  });

  final samples = _samples();
  for (final MapEntry(key: kind, value: list) in samples.entries) {
    for (final sample in list) {
      testWidgets('$kind ${sample.name} matches the web SVG at 24px', (
        tester,
      ) async {
        await tester.pumpWidget(
          Directionality(
            textDirection: TextDirection.ltr,
            child: Center(
              child: RepaintBoundary(
                key: const Key('glyph'),
                child: Icon(
                  _icons[kind]![sample.name],
                  size: 24,
                  color: const Color(0xFF000000),
                ),
              ),
            ),
          ),
        );
        final boundary = tester.renderObject<RenderRepaintBoundary>(
          find.byKey(const Key('glyph')),
        );
        final icon = _icons[kind]![sample.name]!;
        expect(icon.codePoint, sample.codepoint);
        final result = await tester.runAsync(() async {
          final glyph = await _alpha(
            await boundary.toImage(pixelRatio: _ratio),
          );
          final web = await _webCoverage(sample.svg);
          return _compare(web, glyph);
        });
        final r = result!;
        final why = '${sample.name}: $r';
        expect(r.iou, greaterThan(0.85), reason: why);
        // Under a quarter of a logical pixel at 4x.
        expect(r.offset, lessThan(1.0), reason: why);
        expect(r.weight, inInclusiveRange(0.85, 1.2), reason: why);
      });
    }
  }

  for (final (mode, background, ink, muted) in [
    (
      'light',
      const Color(0xFFFFFFFF),
      const Color(0xFF09090B),
      const Color(0xFF71717A),
    ),
    (
      'dark',
      const Color(0xFF09090B),
      const Color(0xFFFAFAFA),
      const Color(0xFFA1A1AA),
    ),
  ]) {
    testWidgets('renders the $mode parity grid (web SVG | mobile glyph)', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(420, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: RepaintBoundary(
            key: _grid,
            child: ColoredBox(
              color: background,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final MapEntry(key: kind, value: list)
                        in samples.entries)
                      for (final sample in list)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: _gridRow(sample, kind, ink, muted),
                        ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      // flutter_svg decodes asynchronously.
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 200)),
      );
      await tester.pump();
      expect(find.byType(SvgPicture), findsWidgets);
      final output = Platform.environment['DESIGN_RENDER_DIR'];
      if (output == null) return;
      await tester.runAsync(() async {
        final boundary = tester.renderObject<RenderRepaintBoundary>(
          find.byKey(_grid),
        );
        final image = await boundary.toImage(pixelRatio: 3);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        image.dispose();
        await Directory(output).create(recursive: true);
        await File(
          '$output/lucide-parity-$mode.png',
        ).writeAsBytes(bytes!.buffer.asUint8List());
      });
    });
  }
}
