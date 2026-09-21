import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/dock_action_transition.dart';

void main() {
  testWidgets('entry and exit move adjacent navigation continuously', (
    tester,
  ) async {
    final width = ValueNotifier<double>(0);
    addTearDown(width.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: ValueListenableBuilder<double>(
          valueListenable: width,
          builder: (context, value, _) => Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(key: Key('nav'), width: 160, height: 60),
                DockActionTransition(
                  identity: value,
                  child: SizedBox(width: value, height: 48),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    double position() => tester.getTopLeft(find.byKey(const Key('nav'))).dx;
    final start = position();
    width.value = 100;
    await tester.pump();
    expect(position(), start);
    await tester.pump(const Duration(milliseconds: 180));
    expect(position(), allOf(lessThan(start), greaterThan(start - 50)));
    await tester.pumpAndSettle();
    expect(position(), start - 50);
    width.value = 0;
    await tester.pump();
    expect(position(), start - 50);
    await tester.pump(const Duration(milliseconds: 180));
    expect(position(), allOf(lessThan(start), greaterThan(start - 50)));
    // Interrupt an exit with a wider replacement. No first-frame jump.
    final interrupted = position();
    width.value = 200;
    await tester.pump();
    expect(position(), interrupted);
    await tester.pumpAndSettle();
    expect(position(), start - 100);
    width.value = 0;
    await tester.pumpAndSettle();
    expect(position(), start);
    expect(tester.takeException(), isNull);
  });

  testWidgets('rounded action stays entirely inside its animated slot', (
    tester,
  ) async {
    final show = ValueNotifier<bool>(false);
    addTearDown(show.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: ValueListenableBuilder<bool>(
            valueListenable: show,
            builder: (context, value, _) => DockActionTransition(
              key: const Key('slot'),
              identity: value,
              child: value
                  ? const SizedBox(key: Key('pill'), width: 140, height: 48)
                  : const SizedBox.shrink(),
            ),
          ),
        ),
      ),
    );
    void expectUnclippedPill() {
      final slot = tester.renderObject<RenderBox>(
        find.byKey(const Key('slot')),
      );
      final pill = tester.renderObject<RenderBox>(
        find.byKey(const Key('pill')),
      );
      final bounds = (Offset.zero & slot.size).inflate(0.01);
      expect(
        bounds.contains(pill.localToGlobal(Offset.zero, ancestor: slot)),
        isTrue,
      );
      expect(
        bounds.contains(
          pill.localToGlobal(
            pill.size.bottomRight(Offset.zero),
            ancestor: slot,
          ),
        ),
        isTrue,
      );
    }

    show.value = true;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 180));
    expectUnclippedPill();
    await tester.pumpAndSettle();
    show.value = false;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 180));
    expectUnclippedPill();
    await tester.pumpAndSettle();
  });

  testWidgets('outgoing actions cannot be tapped; reduced motion skips exit', (
    tester,
  ) async {
    final show = ValueNotifier<bool>(true);
    addTearDown(show.dispose);
    var calls = 0;
    Future<void> mount({bool reducedMotion = false}) => tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: reducedMotion),
          child: Center(
            child: ValueListenableBuilder<bool>(
              valueListenable: show,
              builder: (context, value, _) => DockActionTransition(
                identity: value,
                child: value
                    ? TextButton(
                        onPressed: () => calls++,
                        child: const Text('Create'),
                      )
                    : const SizedBox.shrink(),
              ),
            ),
          ),
        ),
      ),
    );
    await mount();
    show.value = false;
    await tester.pump();
    expect(find.text('Create'), findsOneWidget);
    await tester.tap(find.text('Create'), warnIfMissed: false);
    expect(calls, 0);
    await tester.pumpAndSettle();
    expect(find.text('Create'), findsNothing);
    show.value = true;
    await mount(reducedMotion: true);
    await tester.pump();
    show.value = false;
    await tester.pump();
    expect(find.text('Create'), findsNothing);
  });
}
