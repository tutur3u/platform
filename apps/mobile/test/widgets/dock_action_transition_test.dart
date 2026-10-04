import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/dock_action_transition.dart';

void main() {
  testWidgets('entry reserves and exit releases adjacent navigation space', (
    tester,
  ) async {
    final show = ValueNotifier<bool>(false);
    addTearDown(show.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: ValueListenableBuilder<bool>(
          valueListenable: show,
          builder: (context, value, _) => Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(key: Key('nav'), width: 160, height: 60),
                DockActionTransition(
                  identity: 'create',
                  slotKey: const Key('action-slot'),
                  child: value ? const SizedBox(width: 52, height: 52) : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
    double position() => tester.getTopLeft(find.byKey(const Key('nav'))).dx;
    final start = position();
    show.value = true;
    await tester.pump();
    expect(position(), start);
    await tester.pump(const Duration(milliseconds: 180));
    expect(position(), allOf(lessThan(start), greaterThan(start - 30)));
    await tester.pumpAndSettle();
    expect(position(), start - 30);
    expect(tester.getSize(find.byKey(const Key('action-slot'))).width, 60);
    show.value = false;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    // The visible control hides before the reserved width is released.
    expect(position(), start - 30);
    await tester.pump(const Duration(milliseconds: 80));
    expect(position(), allOf(lessThan(start), greaterThan(start - 30)));
    final interrupted = position();
    show.value = true;
    await tester.pump();
    expect(position(), interrupted);
    await tester.pumpAndSettle();
    expect(position(), start - 30);
    show.value = false;
    await tester.pumpAndSettle();
    expect(position(), start);
    expect(find.byKey(const Key('action-slot')), findsNothing);
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
              key: const Key('transition'),
              slotKey: const Key('slot'),
              identity: 'pill',
              child: value
                  ? const SizedBox(key: Key('pill'), width: 52, height: 52)
                  : null,
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
    expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, 0);
    await tester.pump(const Duration(milliseconds: 100));
    expect(
      tester.widget<Opacity>(find.byType(Opacity)).opacity,
      greaterThan(0),
    );
    expectUnclippedPill();
    await tester.pumpAndSettle();
    show.value = false;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expectUnclippedPill();
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, 0);
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
                identity: 'create',
                slotKey: const Key('action-slot'),
                child: value
                    ? TextButton(
                        onPressed: () => calls++,
                        child: const Text('Create'),
                      )
                    : null,
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
