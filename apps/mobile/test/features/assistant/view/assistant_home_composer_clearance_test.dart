import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_size_reporter.dart';
import 'package:mobile/features/assistant/widgets/assistant_conversation_row.dart';

import 'assistant_s5_shell_harness.dart';

const ValueKey<String> _recent = ValueKey('assistant-recent-conversations');
const ValueKey<String> _actions = ValueKey('assistant-quick-actions');

void _size(WidgetTester tester, Size size, double textScale) {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

Rect _composer(WidgetTester tester) =>
    tester.getRect(find.byType(AssistantComposerSizeReporter));

ScrollPosition _thread(WidgetTester tester) => tester
    .state<ScrollableState>(
      find.descendant(
        of: find.byType(CustomScrollView),
        matching: find.byType(Scrollable),
      ),
    )
    .position;

/// The last recent conversation sits fully above the composer and receives
/// a tap at its centre.
void _expectLastRecentClear(WidgetTester tester) {
  final rows = find.descendant(
    of: find.byKey(_recent),
    matching: find.byType(AssistantConversationRow),
  );
  expect(rows, findsNWidgets(3));
  final last = tester.getRect(rows.last);
  final composer = _composer(tester);
  expect(last.bottom, lessThanOrEqualTo(composer.top));
  expect(last.overlaps(composer), isFalse);
  final hit = tester.hitTestOnBinding(last.center);
  final target = tester.renderObject(rows.last);
  expect(
    hit.path.any(
      (entry) =>
          entry.target is RenderObject &&
          _isWithin(entry.target as RenderObject, target),
    ),
    isTrue,
  );
}

bool _isWithin(RenderObject node, RenderObject ancestor) {
  RenderObject? current = node;
  while (current != null) {
    if (identical(current, ancestor)) return true;
    current = current.parent;
  }
  return false;
}

void main() {
  setUpAssistantShellHarness();

  testWidgets('phone home fits recent chats above the composer', (
    tester,
  ) async {
    _size(tester, const Size(390, 844), 1);
    await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
      storedId: null,
    );
    expect(_thread(tester).pixels, 0);
    _expectLastRecentClear(tester);
    // The scrim covers the composer and the gap above the dock down to the
    // bottom edge, so scrolled content never shows through beneath it.
    final scrim = tester.getRect(
      find.byKey(const ValueKey('assistant-composer-scrim')),
    );
    expect(scrim.top, lessThan(_composer(tester).top));
    expect(scrim.bottom, 844);
    expect(tester.takeException(), isNull);
  });

  testWidgets('small phone with large text scrolls recent chats clear', (
    tester,
  ) async {
    _size(tester, const Size(320, 568), 2);
    await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
      storedId: null,
    );
    final position = _thread(tester);
    position.jumpTo(position.maxScrollExtent);
    await tester.pumpAndSettle();
    _expectLastRecentClear(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tablet home keeps quick actions above the composer', (
    tester,
  ) async {
    _size(tester, const Size(834, 1194), 1);
    await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
      storedId: null,
    );
    final actions = tester.getRect(find.byKey(_actions));
    final composer = _composer(tester);
    expect(actions.bottom, lessThanOrEqualTo(composer.top));
    expect(tester.takeException(), isNull);
  });
}
