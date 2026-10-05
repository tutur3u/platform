import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/habits/view/habits_owned_overlay.dart';

void main() {
  testWidgets('departure removes only the owned route beneath another dialog', (
    tester,
  ) async {
    final alive = ValueNotifier(true);
    final navigator = GlobalKey<NavigatorState>();
    late BuildContext home;
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigator,
        home: Builder(
          builder: (context) {
            home = context;
            return const Text('Home');
          },
        ),
      ),
    );
    final owned = showDialog<void>(
      context: home,
      builder: (_) =>
          HabitsOwnedOverlay(alive: alive, child: const Text('Private Habit')),
    );
    await tester.pumpAndSettle();
    final other = showDialog<void>(
      context: home,
      builder: (_) => const Text('Another app'),
    );
    await tester.pumpAndSettle();
    alive.value = false;
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('Private Habit', skipOffstage: false), findsNothing);
    expect(find.text('Another app'), findsOneWidget);
    navigator.currentState!.pop();
    await tester.pumpAndSettle();
    await owned;
    await other;
    alive.dispose();
  });

  testWidgets('an overlay built after departure never reveals its child', (
    tester,
  ) async {
    final alive = ValueNotifier(false)..dispose();
    late BuildContext home;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            home = context;
            return const Text('Home');
          },
        ),
      ),
    );
    final owned = showDialog<void>(
      context: home,
      builder: (_) =>
          HabitsOwnedOverlay(alive: alive, child: const Text('Private Habit')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Private Habit', skipOffstage: false), findsNothing);
    expect(tester.takeException(), isNull);
    await owned;
  });
}
