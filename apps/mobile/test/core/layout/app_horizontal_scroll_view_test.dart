import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';

void main() {
  testWidgets('the page gutter scrolls away and the edge stays tappable', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final controller = ScrollController();
    addTearDown(controller.dispose);
    const first = ValueKey('first-card');
    var opened = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppHorizontalScrollView(
            controller: controller,
            pageKind: AppPageKind.root,
            child: Row(
              children: [
                GestureDetector(
                  key: first,
                  behavior: HitTestBehavior.opaque,
                  onTap: () => opened = true,
                  child: const SizedBox(width: 180, height: 60),
                ),
                const SizedBox(width: 400),
              ],
            ),
          ),
        ),
      ),
    );

    final gutter = AppPageInsets.resolve(
      width: 390,
      kind: AppPageKind.root,
    ).left;
    expect(tester.getTopLeft(find.byKey(first)).dx, gutter);
    controller.jumpTo(gutter + 10);
    await tester.pump();
    expect(tester.getTopLeft(find.byKey(first)).dx, -10);
    await tester.tapAt(const Offset(2, 30));
    expect(opened, isTrue);
  });
}
