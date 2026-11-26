import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// Decodes every [Image] in the tree before a golden capture.
///
/// Asset images decode asynchronously, outside the fake clock, so a capture
/// taken right after `pumpAndSettle` can miss an icon. Precaching each
/// provider on the real event loop and pumping again makes the raster
/// deterministic.
Future<void> precacheVisibleImages(WidgetTester tester) async {
  final elements = find.byType(Image).evaluate().toList();
  if (elements.isEmpty) return;
  await tester.runAsync(() async {
    for (final element in elements) {
      final image = element.widget as Image;
      await precacheImage(image.image, element);
    }
  });
  await tester.pumpAndSettle();
}
