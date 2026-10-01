import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';

void main() {
  testWidgets('scroll threshold follows inherited geometry without new state', (
    tester,
  ) async {
    final configuration = ValueNotifier((
      scale: 1.0,
      font: 20.0,
      top: 0.0,
      accessible: false,
      revision: 0,
    ));
    final controller = ScrollController();
    addTearDown(configuration.dispose);
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: ValueListenableBuilder(
          valueListenable: configuration,
          builder: (context, geometry, _) => Theme(
            data: ThemeData(
              textTheme: TextTheme(
                titleLarge: TextStyle(fontSize: geometry.font, height: 1),
              ),
            ),
            child: MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(geometry.scale),
                viewPadding: EdgeInsets.only(top: geometry.top),
                accessibleNavigation: geometry.accessible,
              ),
              child: DefaultTextStyle(
                style: const TextStyle(fontSize: 14, height: 1),
                child: FloatingShellDock(
                  location: '/geometry/${geometry.revision}',
                  bottomInset: 0,
                  scrollableHeader: true,
                  header: const SizedBox(
                    key: ValueKey('geometry-header'),
                    height: 46,
                  ),
                  navigation: const SizedBox(),
                  child: ListView.builder(
                    key: const ValueKey('geometry-list'),
                    controller: controller,
                    itemExtent: 50,
                    itemCount: 100,
                    itemBuilder: (_, index) => Text('$index'),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    final originalState = tester.state(find.byType(FloatingShellDock));

    Future<void> scrollAt(double pixels, {required bool hides}) async {
      controller.jumpTo(pixels);
      await tester.pump();
      ScrollUpdateNotification(
        metrics: controller.position,
        context: tester.element(find.byKey(const ValueKey('geometry-list'))),
        scrollDelta: 30,
        dragDetails: DragUpdateDetails(
          globalPosition: Offset.zero,
          delta: const Offset(0, -30),
        ),
      ).dispatch(tester.element(find.byKey(const ValueKey('geometry-list'))));
      await tester.pump();
      final slide = tester.widget<AnimatedSlide>(
        find
            .ancestor(
              of: find.byKey(const ValueKey('geometry-header')),
              matching: find.byType(AnimatedSlide),
            )
            .first,
      );
      expect(slide.offset, hides ? const Offset(0, -1.3) : Offset.zero);
      expect(tester.state(find.byType(FloatingShellDock)), same(originalState));
    }

    await scrollAt(80, hides: true); // Normal header clears at 54px.
    configuration.value = (
      scale: 3,
      font: 20,
      top: 0,
      accessible: false,
      revision: 1,
    );
    await tester.pump();
    await scrollAt(80, hides: false); // Scaled header clears at 84px.
    configuration.value = (
      scale: 1,
      font: 42,
      top: 0,
      accessible: false,
      revision: 2,
    );
    await tester.pump();
    await scrollAt(60, hides: false); // Larger themed title clears at 66px.
    configuration.value = (
      scale: 1,
      font: 20,
      top: 20,
      accessible: false,
      revision: 3,
    );
    await tester.pump();
    await scrollAt(60, hides: false); // Safe-area inset raises it to 74px.
    configuration.value = (
      scale: 1,
      font: 20,
      top: 0,
      accessible: true,
      revision: 4,
    );
    await tester.pump();
    await scrollAt(80, hides: false);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
