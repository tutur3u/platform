import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/inventory/controllers/inventory_season_pricing_controller.dart';
import 'package:mobile/features/inventory/widgets/inventory_season_price_status.dart';

import '../../../helpers/helpers.dart';
import 'season_pricing_controller_test.dart' show period, quote;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await (FontLoader(
      'NotoSans',
    )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
  });
  test('scheduled formatting keeps explicit code and currency precision', () {
    expect(formatSeasonPrice(12.345, 'BHD'), contains('BHD 12.345'));
    expect(formatSeasonPrice(12, 'VND'), 'VND 12');
    expect(formatSeasonPrice(12.5, 'USD'), 'USD 12.50');
  });
  for (final width in [320.0, 768.0]) {
    testWidgets('quote provenance fits $width at large text', (tester) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = Size(width, 420);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final controller =
          InventorySeasonPricingController(
            fetch: (_, _) async => quote(),
            send: (_, _) async => 'unused',
            isOnline: () async => true,
            now: () => DateTime.utc(2026, 10),
          )..configure(
            actorId: 'actor',
            workspaceId: 'ws',
            selectedPeriod: period(),
            currency: 'USD',
          );
      addTearDown(controller.dispose);
      await controller.refresh();
      final key = GlobalKey();
      await tester.pumpApp(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.5)),
            child: RepaintBoundary(
              key: key,
              child: ColoredBox(
                color: Colors.white,
                child: DefaultTextStyle(
                  style: const TextStyle(
                    fontFamily: 'NotoSans',
                    fontSize: 14,
                    color: Colors.black,
                  ),
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      InventorySeasonPriceStatus(controller: controller),
                      Text(formatSeasonPrice(12.5, 'USD')),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('2026-10-01 01:00:00'), findsOneWidget);
      expect(find.text('USD 12.50'), findsOneWidget);
      expect(tester.takeException(), isNull);
      final directory = Platform.environment['INVENTORY_SEASON_VISUAL_DIR'];
      if (directory != null) {
        final boundary =
            key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        await tester.runAsync(() async {
          final image = await boundary.toImage();
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await File(
            '$directory/season-status-${width.toInt()}.png',
          ).writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
