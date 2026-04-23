import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

import '../helpers/helpers.dart';

void main() {
  testWidgets('keeps a square fixed size under larger parent constraints', (
    tester,
  ) async {
    await tester.pumpApp(
      const Center(
        child: SizedBox(
          width: 200,
          height: 80,
          child: NovaLoadingIndicator(),
        ),
      ),
    );

    final indicatorSize = tester.getSize(
      find.descendant(
        of: find.byType(NovaLoadingIndicator),
        matching: find.byType(Image),
      ),
    );

    expect(indicatorSize.width, 56);
    expect(indicatorSize.height, 56);
  });
}
