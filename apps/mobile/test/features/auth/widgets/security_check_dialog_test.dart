import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/auth/widgets/security_check_dialog.dart';

import '../../../helpers/helpers.dart';

const ValueKey<String> _panel = ValueKey('security-check-panel');

void _useWindow(WidgetTester tester, Size size) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// A page with the trigger at the top and a second control that must stay
/// usable while the panel is open.
Widget _page({
  required Future<void> Function(BuildContext context) onVerify,
  VoidCallback? onOther,
}) => Align(
  alignment: Alignment.topCenter,
  child: Builder(
    builder: (context) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        TextButton(
          onPressed: () => unawaited(onVerify(context)),
          child: const Text('Verify'),
        ),
        TextButton(onPressed: onOther, child: const Text('Other')),
      ],
    ),
  ),
);

void main() {
  _securityPanelDimTests();

  testWidgets('retiring the initiating request closes its check', (
    tester,
  ) async {
    final cancellation = ValueNotifier(false);
    addTearDown(cancellation.dispose);
    var completed = false;
    await tester.pumpApp(
      _page(
        onVerify: (context) async {
          final token = await showSecurityCheckPanel(
            Navigator.of(context, rootNavigator: true),
            cancellation: cancellation,
            challengeBuilder: (_, _, _) => const SizedBox(height: 65),
          );
          expect(token, isNull);
          completed = true;
        },
      ),
    );
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(find.byKey(_panel), findsOneWidget);
    expect(completed, isFalse);

    cancellation.value = true;
    await tester.pumpAndSettle();
    expect(find.byKey(_panel), findsNothing);
    expect(completed, isTrue);
  });

  testWidgets('retry rejects stale tokens and completes only once', (
    tester,
  ) async {
    final callbacks = <ValueChanged<String>>[];
    String? result;
    var completed = 0;
    await tester.pumpApp(
      _page(
        onVerify: (context) async {
          result = await showSecurityCheckPanel(
            Navigator.of(context, rootNavigator: true),
            challengeBuilder: (key, onToken, onFailure) {
              if (callbacks.length <= (key as ValueKey<int>).value) {
                callbacks.add(onToken);
              }
              return TextButton(
                onPressed: onFailure,
                child: const Text('Fail'),
              );
            },
          );
          completed++;
        },
      ),
    );
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(find.byKey(_panel), findsOneWidget);
    callbacks.first('');
    await tester.pump();
    expect(find.byKey(_panel), findsOneWidget);
    await tester.tap(find.text('Fail'));
    await tester.pump();
    await tester.tap(find.text('Retry'));
    await tester.pump();
    expect(callbacks, hasLength(2));
    callbacks.first('stale-token');
    await tester.pump();
    expect(find.byKey(_panel), findsOneWidget);
    callbacks.last('fresh-token');
    callbacks.last('duplicate-token');
    await tester.pumpAndSettle();
    expect(result, 'fresh-token');
    expect(completed, 1);
    expect(find.byKey(_panel), findsNothing);
  });

  testWidgets('the page stays usable while the check is open', (tester) async {
    var others = 0;
    await tester.pumpApp(
      _page(
        onVerify: (context) => showSecurityCheckPanel(
          Navigator.of(context, rootNavigator: true),
          challengeBuilder: (_, _, _) => const SizedBox(height: 65),
        ),
        onOther: () => others++,
      ),
    );
    final barriers = find.byType(ModalBarrier).evaluate().length;
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(find.byKey(_panel), findsOneWidget);
    // No new barrier and no dialog: the rest of the page still takes input.
    expect(find.byType(Dialog), findsNothing);
    expect(find.byType(ModalBarrier).evaluate().length, barriers);
    await tester.tap(find.text('Other'));
    expect(others, 1);
    await tester.tap(find.byTooltip('Not now'));
    await tester.pumpAndSettle();
  });

  testWidgets('a form check blocks the page until it closes', (tester) async {
    var others = 0;
    final results = <String?>[];
    await tester.pumpApp(
      _page(
        onVerify: (context) async {
          results.add(
            await showSecurityCheckPanel(
              Navigator.of(context, rootNavigator: true),
              modal: true,
              challengeBuilder: (_, _, _) => const SizedBox(height: 65),
            ),
          );
        },
        onOther: () => others++,
      ),
    );
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(find.byKey(_panel), findsOneWidget);
    // Sign-in and feedback stay as submitted: the form takes no input and
    // keyboard focus stays in the card.
    await tester.tap(find.text('Other'), warnIfMissed: false);
    expect(others, 0);
    for (var i = 0; i < 4; i++) {
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      final focus = FocusManager.instance.primaryFocus?.context;
      expect(
        focus?.findAncestorWidgetOfExactType<SecurityCheckPanel>(),
        isNotNull,
      );
    }
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(results, [null]);
    expect(find.byKey(_panel), findsNothing);
    await tester.tap(find.text('Other'));
    expect(others, 1);

    // System Back closes the card first and leaves the form in place.
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(find.byKey(_panel), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(results, [null, null]);
    expect(find.byKey(_panel), findsNothing);
    expect(find.text('Verify'), findsOneWidget);
  });

  for (final (name, dismiss) in <(String, Future<void> Function(WidgetTester))>[
    ('Not now', (tester) => tester.tap(find.byTooltip('Not now'))),
    ('Escape', (tester) => tester.sendKeyEvent(LogicalKeyboardKey.escape)),
    // System Back closes the card before it navigates the page.
    ('Back', (tester) => tester.binding.handlePopRoute()),
    ('The shell', (tester) async => SecurityCheckCard.dismiss()),
  ]) {
    testWidgets('$name cancels verification without a token', (tester) async {
      String? result = 'not-completed';
      await tester.pumpApp(
        _page(
          onVerify: (context) async {
            result = await showSecurityCheckPanel(
              Navigator.of(context, rootNavigator: true),
              challengeBuilder: (_, _, _) => const SizedBox(height: 65),
            );
          },
        ),
      );
      expect(SecurityCheckCard.isOpen, isFalse);
      await tester.tap(find.text('Verify'));
      await tester.pumpAndSettle();
      expect(SecurityCheckCard.isOpen, isTrue);
      await dismiss(tester);
      await tester.pumpAndSettle();
      expect(result, isNull);
      expect(find.byKey(_panel), findsNothing);
      expect(SecurityCheckCard.isOpen, isFalse);
      expect(SecurityCheckCard.dismiss(), isFalse);
      // The page itself is still there.
      expect(find.text('Verify'), findsOneWidget);
    });
  }

  testWidgets('a removed navigator settles the waiting request', (
    tester,
  ) async {
    String? result = 'not-completed';
    final show = ValueNotifier<bool>(true);
    addTearDown(show.dispose);
    await tester.pumpApp(
      ValueListenableBuilder<bool>(
        valueListenable: show,
        builder: (context, visible, _) => visible
            ? Navigator(
                onGenerateRoute: (_) => MaterialPageRoute<void>(
                  builder: (context) => _page(
                    onVerify: (context) async {
                      result = await showSecurityCheckPanel(
                        Navigator.of(context),
                        challengeBuilder: (_, _, _) =>
                            const SizedBox(height: 65),
                      );
                    },
                  ),
                ),
              )
            : const SizedBox.shrink(),
      ),
    );
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(find.byKey(_panel), findsOneWidget);
    // For example an account switch rebuilding the navigator.
    show.value = false;
    await tester.pumpAndSettle();
    expect(result, isNull);
  });

  testWidgets('Escape dismisses even while a text field keeps focus', (
    tester,
  ) async {
    String? result = 'not-completed';
    await tester.pumpApp(
      Builder(
        builder: (context) => Column(
          children: [
            const TextField(key: ValueKey('note')),
            TextButton(
              onPressed: () async {
                result = await showSecurityCheckPanel(
                  Navigator.of(context, rootNavigator: true),
                  challengeBuilder: (_, _, _) => const SizedBox(height: 65),
                );
              },
              child: const Text('Verify'),
            ),
          ],
        ),
      ),
    );
    await tester.tap(find.byKey(const ValueKey('note')));
    await tester.pump();
    final field = FocusManager.instance.primaryFocus;
    // An autosave asks for verification while the person is typing.
    tester.widget<TextButton>(find.byType(TextButton)).onPressed!();
    await tester.pumpAndSettle();
    expect(find.byKey(_panel), findsOneWidget);
    expect(FocusManager.instance.primaryFocus, same(field));
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(result, isNull);
    expect(FocusManager.instance.primaryFocus, same(field));
  });

  testWidgets('Escape in another field leaves the check open', (tester) async {
    String? result = 'not-completed';
    await tester.pumpApp(
      Builder(
        builder: (context) => Column(
          children: [
            const TextField(key: ValueKey('note')),
            const TextField(key: ValueKey('other')),
            TextButton(
              onPressed: () async {
                result = await showSecurityCheckPanel(
                  Navigator.of(context, rootNavigator: true),
                  challengeBuilder: (_, _, _) => const SizedBox(height: 65),
                );
              },
              child: const Text('Verify'),
            ),
          ],
        ),
      ),
    );
    await tester.tap(find.byKey(const ValueKey('note')));
    await tester.pump();
    tester.widget<TextButton>(find.byType(TextButton)).onPressed!();
    await tester.pumpAndSettle();
    // Focus moves to a field the panel did not open over, such as one in
    // another dialog: its Escape is not the panel's.
    await tester.tap(find.byKey(const ValueKey('other')));
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(result, 'not-completed');
    expect(find.byKey(_panel), findsOneWidget);
    await tester.tap(find.byTooltip('Not now'));
    await tester.pumpAndSettle();
    expect(result, isNull);
  });

  testWidgets('an unanswered check gives up instead of hanging', (
    tester,
  ) async {
    String? result = 'not-completed';
    await tester.pumpApp(
      _page(
        onVerify: (context) async {
          result = await showSecurityCheckPanel(
            Navigator.of(context, rootNavigator: true),
            giveUpAfter: const Duration(seconds: 5),
            challengeBuilder: (_, _, _) => const SizedBox(height: 65),
          );
        },
      ),
    );
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    expect(result, isNull);
    expect(find.byKey(_panel), findsNothing);
  });

  for (final (name, size) in [
    ('phone', const Size(390, 844)),
    ('laptop', const Size(1440, 900)),
  ]) {
    testWidgets('the check sits in context on a $name', (tester) async {
      _useWindow(tester, size);
      await tester.pumpApp(
        _page(
          onVerify: (context) => showSecurityCheckPanel(
            Navigator.of(context, rootNavigator: true),
            challengeBuilder: (_, _, _) => const SizedBox(height: 65),
          ),
        ),
      );
      await tester.tap(find.text('Verify'));
      await tester.pumpAndSettle();
      final panel = tester.getRect(find.byKey(_panel));
      if (size.width < 600) {
        // A bottom card above the floating dock, edge to edge.
        expect(panel.left, AppSpacing.md);
        expect(panel.right, size.width - AppSpacing.md);
        expect(
          panel.bottom,
          closeTo(size.height - ShellDockMetrics.clearanceFor(0), 0.5),
        );
      } else {
        // A corner card on wide screens.
        expect(panel.width, 380);
        expect(panel.right, size.width - AppSpacing.xxl);
        expect(panel.bottom, size.height - AppSpacing.xxl);
      }
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Not now'));
      await tester.pumpAndSettle();
    });
  }
}

void _expectPageNotDimmed(WidgetTester tester) {
  for (final barrier in tester.widgetList<ModalBarrier>(
    find.byType(ModalBarrier),
  )) {
    expect(barrier.color == null || barrier.color!.a == 0, isTrue);
  }
  final veiled = find.ancestor(
    of: find.text('Other'),
    matching: find.byWidgetPredicate(
      (widget) =>
          (widget is Opacity && widget.opacity < 1) ||
          (widget is ColoredBox && widget.color.a > 0 && widget.color.a < 1),
    ),
  );
  expect(veiled, findsNothing);
}

void _securityPanelDimTests() {
  for (final modal in [true, false]) {
    testWidgets('the ${modal ? 'modal' : 'inline'} card never dims the page', (
      tester,
    ) async {
      String? result = 'unset';
      await tester.pumpApp(
        _page(
          onVerify: (context) async {
            result = await showSecurityCheckPanel(
              Navigator.of(context, rootNavigator: true),
              modal: modal,
              challengeBuilder: (key, onToken, onFailure) =>
                  const SizedBox(height: 64),
            );
          },
        ),
      );
      await tester.tap(find.text('Verify'));
      await tester.pumpAndSettle();
      expect(find.byKey(_panel), findsOneWidget);
      expect(find.text('Quick security check'), findsOneWidget);
      _expectPageNotDimmed(tester);

      await tester.tap(find.byTooltip('Not now'));
      await tester.pumpAndSettle();
      expect(find.byKey(_panel), findsNothing);
      expect(result, isNull);
    });
  }
}
