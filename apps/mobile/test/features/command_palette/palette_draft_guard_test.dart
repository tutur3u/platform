import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/draft_route_guard.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/command_palette/palette_view.dart';

import 'palette_host_harness.dart';

const _size = Size(1200, 800);

/// A draft pushed on a navigator nested in the page while focus stays on shell
/// chrome outside that navigator, as with the Mail composer.
class _NestedDraft {
  final navigator = GlobalKey<NavigatorState>();
  final chromeFocus = FocusNode();

  Widget home(BuildContext context) => Scaffold(
    body: Column(
      children: [
        TextButton(
          focusNode: chromeFocus,
          autofocus: true,
          onPressed: () {},
          child: const Text('Chrome'),
        ),
        Expanded(
          child: Navigator(
            key: navigator,
            observers: [DraftRouteGuard.instance.toObserver()],
            onGenerateRoute: (_) => MaterialPageRoute<void>(
              builder: (_) => const Center(child: Text('Inbox')),
            ),
          ),
        ),
      ],
    ),
  );

  void pushDraft() => navigator.currentState!.push<void>(
    MaterialPageRoute<void>(
      builder: (_) => const Scaffold(body: TextField(key: Key('draft'))),
    ),
  );
}

Future<PaletteHarness> _pump(WidgetTester tester, _NestedDraft draft) {
  addTearDown(draft.chromeFocus.dispose);
  return pumpPaletteApp(
    tester,
    platform: TargetPlatform.linux,
    size: _size,
    home: draft.home,
  );
}

Future<void> _chord(WidgetTester tester, LogicalKeyboardKey key) =>
    paletteChord(tester, LogicalKeyboardKey.controlLeft, key);

void main() {
  testWidgets(
    'a draft on a nested navigator blocks shortcuts from chrome focus',
    (tester) async {
      final draft = _NestedDraft();
      final harness = await _pump(tester, draft);

      draft.pushDraft();
      await tester.pumpAndSettle();
      draft.chromeFocus.requestFocus();
      await tester.pump();
      expect(draft.chromeFocus.hasFocus, isTrue);
      expect(find.byKey(const Key('draft')), findsOneWidget);
      expect(DraftRouteGuard.instance.hasBlockingRoute, isTrue);

      for (final key in [
        LogicalKeyboardKey.keyK,
        LogicalKeyboardKey.digit2,
        LogicalKeyboardKey.comma,
        LogicalKeyboardKey.keyN,
      ]) {
        await _chord(tester, key);
        expect(find.byType(CommandPaletteView), findsNothing);
        expect(harness.path, Routes.home, reason: key.keyLabel);
      }

      draft.navigator.currentState!.pop();
      await tester.pumpAndSettle();
      expect(DraftRouteGuard.instance.hasBlockingRoute, isFalse);
      await _chord(tester, LogicalKeyboardKey.digit2);
      expect(harness.path, Routes.apps);
    },
  );

  testWidgets('a draft opened while the palette shows blocks its selection', (
    tester,
  ) async {
    final draft = _NestedDraft();
    final harness = await _pump(tester, draft);

    await _chord(tester, LogicalKeyboardKey.keyK);
    expect(find.byType(CommandPaletteView), findsOneWidget);
    expect(DraftRouteGuard.instance.hasBlockingRoute, isFalse);

    draft.pushDraft();
    await tester.pumpAndSettle();
    expect(DraftRouteGuard.instance.hasBlockingRoute, isTrue);
    tester
        .widget<EditableText>(
          find.descendant(
            of: find.byType(CommandPaletteView),
            matching: find.byType(EditableText),
          ),
        )
        .focusNode
        .requestFocus();
    await tester.pump();

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();

    expect(find.byType(CommandPaletteView), findsNothing);
    expect(harness.path, Routes.home);
    expect(find.byKey(const Key('draft')), findsOneWidget);
  });
}
