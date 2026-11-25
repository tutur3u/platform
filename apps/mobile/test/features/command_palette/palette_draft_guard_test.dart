import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/draft_route_guard.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/command_palette/palette_view.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';

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

  testWidgets(
    'a draft opened while the palette shows blocks Switch workspace',
    (tester) async {
      final draft = _NestedDraft();
      final harness = await _pump(tester, draft);

      await _chord(tester, LogicalKeyboardKey.keyK);
      expect(find.byType(CommandPaletteView), findsOneWidget);
      draft.pushDraft();
      await tester.pumpAndSettle();
      final search = find.descendant(
        of: find.byType(CommandPaletteView),
        matching: find.byType(EditableText),
      );
      tester.widget<EditableText>(search).focusNode.requestFocus();
      await tester.pump();
      await tester.enterText(search, 'workspace');
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();

      expect(find.byType(CommandPaletteView), findsNothing);
      expect(find.byType(WorkspacePickerSheet), findsNothing);
      expect(harness.path, Routes.home);
      expect(find.byKey(const Key('draft')), findsOneWidget);
    },
  );

  testWidgets('a route disposed without a pop is not retained', (tester) async {
    final guard = DraftRouteGuard.instance;
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        home: Navigator(
          key: navigator,
          observers: [guard.toObserver()],
          onGenerateRoute: (_) =>
              MaterialPageRoute<void>(builder: (_) => const Text('Inbox')),
        ),
      ),
    );
    navigator.currentState!.push<void>(
      MaterialPageRoute<void>(builder: (_) => const Text('Draft')),
    );
    await tester.pumpAndSettle();
    expect(guard.hasBlockingRoute, isTrue);
    expect(guard.trackedCount, 1);

    // The navigator goes away with its routes still on the stack.
    await tester.pumpWidget(const SizedBox.shrink());

    // Another navigator's next push is enough to release the retired route.
    final other = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        home: Navigator(
          key: other,
          observers: [guard.toObserver()],
          onGenerateRoute: (_) =>
              MaterialPageRoute<void>(builder: (_) => const Text('Other')),
        ),
      ),
    );
    other.currentState!.push<void>(
      MaterialPageRoute<void>(builder: (_) => const Text('Next draft')),
    );
    await tester.pumpAndSettle();
    expect(guard.trackedCount, 1);

    other.currentState!.pop();
    await tester.pumpAndSettle();
    expect(guard.trackedCount, 0);
    expect(guard.hasBlockingRoute, isFalse);
  });
}
