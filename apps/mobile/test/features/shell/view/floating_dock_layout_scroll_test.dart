import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';

void main() {
  testWidgets('a list that shrinks while scrolled updates the dock without '
      'measuring mid-layout', (tester) async {
    final count = ValueNotifier(60);
    final controller = ScrollController();
    addTearDown(count.dispose);
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: FloatingShellDock(
          location: '/chat',
          bottomInset: 0,
          header: const SizedBox(height: 46),
          navigation: const SizedBox(),
          child: ValueListenableBuilder<int>(
            valueListenable: count,
            builder: (_, items, _) => ListView.builder(
              controller: controller,
              itemExtent: 50,
              itemCount: items,
              itemBuilder: (_, index) => Text('$index'),
            ),
          ),
        ),
      ),
    );
    controller.jumpTo(controller.position.maxScrollExtent);
    await tester.pumpAndSettle();

    // Removing most rows clamps the offset during layout, where Flutter
    // starts a ballistic scroll and reports it to the dock.
    count.value = 3;
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(controller.offset, 0);
  });
}
