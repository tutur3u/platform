import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';

Widget _list(ValueNotifier<int> count, ScrollController controller) =>
    ValueListenableBuilder<int>(
      valueListenable: count,
      builder: (_, items, _) => ListView.builder(
        controller: controller,
        // iOS physics settle an out-of-range offset with a ballistic scroll
        // that starts inside layout.
        physics: const BouncingScrollPhysics(),
        itemExtent: 50,
        itemCount: items,
        itemBuilder: (_, index) => Text('$index'),
      ),
    );

void main() {
  testWidgets(
    'a transformed list that shrinks while scrolled settles cleanly',
    (tester) async {
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
            // A route-transition style transform sits between the viewport and
            // the dock when the dock maps the viewport's position.
            child: FractionalTranslation(
              translation: const Offset(0, 0.001),
              child: _list(count, controller),
            ),
          ),
        ),
      );
      controller.jumpTo(controller.position.maxScrollExtent);
      await tester.pumpAndSettle();

      // Removing most rows leaves the offset out of range, so the list settles
      // with a ballistic scroll that starts during layout.
      count.value = 3;
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(controller.offset, 0);
    },
  );

  testWidgets('an offstage list reporting in the same frame is ignored', (
    tester,
  ) async {
    final visible = ValueNotifier(60);
    final hidden = ValueNotifier(60);
    final visibleController = ScrollController();
    final hiddenController = ScrollController();
    addTearDown(visible.dispose);
    addTearDown(hidden.dispose);
    addTearDown(visibleController.dispose);
    addTearDown(hiddenController.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: FloatingShellDock(
          location: '/chat',
          bottomInset: 0,
          header: const SizedBox(height: 46),
          navigation: const SizedBox(),
          child: Column(
            children: [
              Expanded(child: _list(visible, visibleController)),
              Expanded(
                child: TickerMode(
                  enabled: false,
                  child: _list(hidden, hiddenController),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    visibleController.jumpTo(visibleController.position.maxScrollExtent);
    hiddenController.jumpTo(hiddenController.position.maxScrollExtent);
    await tester.pumpAndSettle();

    visible.value = 3;
    hidden.value = 3;
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(visibleController.offset, 0);
  });
}
