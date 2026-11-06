import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/privacy/mastermind_privacy_shield.dart';

const _shield = ValueKey<String>('mastermind-privacy-shield');

Future<void> _pump(WidgetTester tester, ValueNotifier<String> location) =>
    tester.pumpWidget(
      MaterialApp(
        home: MastermindPrivacyShield(
          location: () => location.value,
          locationChanges: location,
          child: const Text('Decision text'),
        ),
      ),
    );

Future<void> _move(WidgetTester tester, AppLifecycleState state) async {
  tester.binding.handleAppLifecycleStateChanged(state);
  await tester.pump();
}

void main() {
  setUp(() {
    // The binding keeps the last lifecycle state across tests in one file.
    TestWidgetsFlutterBinding.ensureInitialized()
        .handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  });

  group('isMastermindPath', () {
    test('matches the root and every route beneath it', () {
      for (final path in const [
        '/mastermind',
        '/mastermind/inbox',
        '/mastermind/inbox/item/item-1',
        '/mastermind/inbox/decision/d-1',
        '/mastermind/work/lane/lane-1',
        '/mastermind/ship',
        '/mastermind/insights',
      ]) {
        expect(isMastermindPath(path), isTrue, reason: path);
      }
    });

    test('ignores every other route, including near misses', () {
      for (final path in const [
        '/',
        '/home',
        '/mastermindx',
        '/other/mastermind',
        '',
      ]) {
        expect(isMastermindPath(path), isFalse, reason: path);
      }
    });
  });

  group('MastermindPrivacyShield (SB-100 L2)', () {
    testWidgets('leaves a foreground Mastermind route uncovered', (
      tester,
    ) async {
      await _pump(tester, ValueNotifier('/mastermind/inbox'));

      expect(find.byKey(_shield), findsNothing);
      expect(find.text('Decision text'), findsOneWidget);
    });

    testWidgets('covers every Mastermind route once the app leaves', (
      tester,
    ) async {
      final location = ValueNotifier('/mastermind');
      await _pump(tester, location);

      for (final path in const [
        '/mastermind',
        '/mastermind/inbox',
        '/mastermind/inbox/item/item-1',
        '/mastermind/inbox/decision/d-1',
        '/mastermind/work',
        '/mastermind/ship',
        '/mastermind/insights',
      ]) {
        location.value = path;
        await _move(tester, AppLifecycleState.inactive);
        expect(find.byKey(_shield), findsOneWidget, reason: path);
        await _move(tester, AppLifecycleState.resumed);
        expect(find.byKey(_shield), findsNothing, reason: path);
      }
    });

    testWidgets('covers on inactive, hidden and paused alike', (tester) async {
      await _pump(tester, ValueNotifier('/mastermind/inbox'));

      await _move(tester, AppLifecycleState.inactive);
      expect(find.byKey(_shield), findsOneWidget);
      await _move(tester, AppLifecycleState.hidden);
      expect(find.byKey(_shield), findsOneWidget);
      await _move(tester, AppLifecycleState.paused);
      expect(find.byKey(_shield), findsOneWidget);
      await _move(tester, AppLifecycleState.resumed);
      expect(find.byKey(_shield), findsNothing);
    });

    testWidgets('leaves routes outside Mastermind uncovered', (tester) async {
      await _pump(tester, ValueNotifier('/home'));

      await _move(tester, AppLifecycleState.inactive);

      expect(find.byKey(_shield), findsNothing);
    });

    testWidgets('follows a navigation that happens while away', (tester) async {
      final location = ValueNotifier('/home');
      await _pump(tester, location);
      await _move(tester, AppLifecycleState.inactive);
      expect(find.byKey(_shield), findsNothing);

      location.value = '/mastermind/inbox';
      await tester.pump();
      expect(find.byKey(_shield), findsOneWidget);

      location.value = '/home';
      await tester.pump();
      expect(find.byKey(_shield), findsNothing);
    });
  });
}
