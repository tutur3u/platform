import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';

void main() {
  testWidgets(
    'material bounds interpolate with one current interactive content',
    (tester) async {
      final composing = ValueNotifier(false);
      addTearDown(composing.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Center(
            child: SizedBox(
              width: 390,
              child: ValueListenableBuilder<bool>(
                valueListenable: composing,
                builder: (_, chat, _) => PersistentShellDock(
                  navigationWidth: 180,
                  composing: chat,
                  content: SizedBox(
                    height: 52,
                    child: Text(chat ? 'prompt' : 'navigation'),
                  ),
                  primary: const SizedBox(width: 52, height: 52),
                ),
              ),
            ),
          ),
        ),
      );
      final state = tester.state(find.byType(PersistentShellDock));
      final material = find.byKey(
        const ValueKey('persistent-shell-dock-material'),
      );
      final element = tester.element(material);
      final initial = tester.getSize(material).width;
      composing.value = true;
      await tester.pump();
      expect(tester.getSize(material).width, initial);
      await tester.pump(const Duration(milliseconds: 100));
      final intermediate = tester.getSize(material).width;
      expect(intermediate, greaterThan(initial));
      expect(intermediate, lessThan(330));
      expect(find.text('navigation'), findsNothing);
      expect(find.text('prompt'), findsOneWidget);
      await tester.pumpAndSettle();
      expect(tester.getSize(material).width, 330);
      expect(
        identical(tester.state(find.byType(PersistentShellDock)), state),
        isTrue,
      );
      expect(identical(tester.element(material), element), isTrue);
      expect(find.byType(BackdropFilter), findsOneWidget);
    },
  );

  testWidgets(
    'slot is location scoped; stale publishers cannot remove successor',
    (tester) async {
      final controller = ShellDockSlotController();
      addTearDown(controller.dispose);
      final first = Object();
      final second = Object();
      const slot = ShellDockSlot(
        location: '/assistant',
        composing: true,
        content: SizedBox(height: 52, child: Text('prompt')),
        primary: SizedBox(width: 52, height: 52),
      );
      controller
        ..publish(first, slot)
        ..publish(second, slot)
        ..remove(first);
      expect(controller.slot, same(slot));
      final route = ValueNotifier('/assistant');
      addTearDown(route.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: ShellDockScope(
            controller: controller,
            child: ValueListenableBuilder<String>(
              valueListenable: route,
              builder: (_, location, _) => FloatingShellDock(
                location: location,
                bottomInset: 68,
                navigation: const SizedBox(
                  height: 52,
                  child: Text('navigation'),
                ),
                child: const SizedBox.expand(),
              ),
            ),
          ),
        ),
      );
      expect(find.text('prompt'), findsOneWidget);
      final state = tester.state(find.byType(PersistentShellDock));
      route.value = '/profile';
      await tester.pump();
      expect(find.text('prompt'), findsNothing);
      expect(find.text('navigation'), findsOneWidget);
      expect(
        identical(tester.state(find.byType(PersistentShellDock)), state),
        isTrue,
      );
      controller.remove(second);
      await tester.pumpAndSettle();
      expect(controller.slot, isNull);
    },
  );

  testWidgets(
    'publisher disposal cannot resurrect retained composer controls',
    (tester) async {
      final controller = ShellDockSlotController();
      addTearDown(controller.dispose);
      const slot = ShellDockSlot(
        location: '/assistant',
        composing: true,
        content: Text('old draft'),
        primary: SizedBox(),
      );
      Widget app({required bool present}) => MaterialApp(
        home: ShellDockScope(
          controller: controller,
          child: present
              ? const ShellDockPublisher(slot: slot)
              : const SizedBox(),
        ),
      );
      await tester.pumpWidget(app(present: true));
      await tester.pump();
      expect(controller.slot, same(slot));
      await tester.pumpWidget(app(present: false));
      await tester.pump();
      expect(controller.slot, isNull);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('reduced motion has settled geometry and enlarged prompt fits', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(
            disableAnimations: true,
            textScaler: TextScaler.linear(2),
          ),
          child: Center(
            child: SizedBox(
              width: 320,
              child: PersistentShellDock(
                composing: true,
                content: SizedBox(height: 78, child: Text('Prompt')),
                primary: SizedBox(width: 52, height: 52),
              ),
            ),
          ),
        ),
      ),
    );
    expect(
      tester
          .getSize(find.byKey(const ValueKey('persistent-shell-dock-material')))
          .width,
      260,
    );
    expect(tester.takeException(), isNull);
  });
}
