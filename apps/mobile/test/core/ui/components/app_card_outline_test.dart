import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/ui.dart';

import '../../../helpers/pump_app.dart';

const _boundary = ValueKey<String>('card');
const _fill = Color(0xFF000000);
const _line = Color(0xFFFFFFFF);

Future<void> _pump(
  WidgetTester tester,
  Widget card, {
  SorbetTheme? sorbet,
  Brightness brightness = Brightness.light,
  bool highContrast = false,
}) async {
  tester.view
    ..physicalSize = const Size(200, 200)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    sorbetTestApp(
      sorbet: sorbet,
      brightness: brightness,
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(highContrast: highContrast),
          child: Center(
            child: RepaintBoundary(
              key: _boundary,
              child: SizedBox(width: 120, height: 80, child: card),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// The foreground outline painted over the card's [Material], if any.
BoxDecoration? _outline(WidgetTester tester) {
  final boxes = tester
      .widgetList<DecoratedBox>(
        find.ancestor(
          of: find.byType(Material).last,
          matching: find.byType(DecoratedBox),
        ),
      )
      .where((box) => box.position == DecorationPosition.foreground);
  return boxes.isEmpty ? null : boxes.single.decoration as BoxDecoration;
}

Color _pixel(ByteData bytes, int width, int x, int y) {
  final offset = (y * width + x) * 4;
  return Color.fromARGB(
    bytes.getUint8(offset + 3),
    bytes.getUint8(offset),
    bytes.getUint8(offset + 1),
    bytes.getUint8(offset + 2),
  );
}

void main() {
  testWidgets('paints the outline above an opaque fill', (tester) async {
    await _pump(
      tester,
      const AppCard(
        fillColor: _fill,
        borderColor: _line,
        borderRadius: BorderRadius.zero,
        child: SizedBox.expand(),
      ),
    );

    final outline = _outline(tester);
    expect(outline, isNotNull);
    expect((outline!.border! as Border).top.color, _line);

    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_boundary),
    );
    final bytes = await tester.runAsync(() async {
      final image = await boundary.toImage();
      final data = await image.toByteData();
      image.dispose();
      return data;
    });
    final width = boundary.size.width.toInt();
    final middle = boundary.size.height ~/ 2;
    expect(_pixel(bytes!, width, 0, middle), _line);
    expect(_pixel(bytes, width, width - 1, middle), _line);
    expect(_pixel(bytes, width, width ~/ 2, 0), _line);
    expect(_pixel(bytes, width, width ~/ 2, middle), _fill);
  });

  testWidgets('keeps the ink ripple and tap under the outline', (tester) async {
    var taps = 0;
    await _pump(
      tester,
      AppCard(
        onTap: () => taps++,
        semanticLabel: 'Open',
        child: const SizedBox.expand(),
      ),
    );
    expect(_outline(tester), isNotNull);
    await tester.tap(find.byType(AppCard));
    expect(taps, 1);
    expect(find.bySemanticsLabel('Open'), findsOneWidget);
  });

  testWidgets('Sorbet separates by shadow unless high contrast is on', (
    tester,
  ) async {
    const card = AppCard(child: SizedBox.expand());
    await _pump(tester, card, sorbet: const SorbetTheme());
    expect(_outline(tester), isNull);

    await _pump(
      tester,
      card,
      sorbet: const SorbetTheme(),
      brightness: Brightness.dark,
      highContrast: true,
    );
    expect(_outline(tester), isNotNull);
  });

  for (final brightness in Brightness.values) {
    testWidgets('high contrast lifts the ${brightness.name} outline to 3:1', (
      tester,
    ) async {
      await _pump(
        tester,
        const AppCard(child: SizedBox.expand()),
        brightness: brightness,
        highContrast: true,
      );
      final context = tester.element(find.byType(AppCard));
      final card = AppTokens.of(context).colorScheme.card;
      final line = (_outline(tester)!.border! as Border).top.color;
      expect(
        AppearanceContrast.ratio(line, card),
        greaterThanOrEqualTo(AppearanceContrast.aaNonText),
      );
    });
  }
}
