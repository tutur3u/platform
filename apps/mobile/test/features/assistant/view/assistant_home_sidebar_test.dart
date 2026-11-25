import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/assistant/widgets/assistant_conversations.dart';
import 'package:mobile/features/assistant/widgets/assistant_empty_hero.dart';

import 'assistant_s5_shell_harness.dart';

const ValueKey<String> _sidebar = ValueKey('assistant-history-sidebar');
const ValueKey<String> _recent = ValueKey('assistant-recent-conversations');

void _size(WidgetTester tester, Size size) {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  setUpAssistantShellHarness();

  testWidgets('phone new chat shows quick actions and recent conversations', (
    tester,
  ) async {
    _size(tester, const Size(390, 844));
    final router = await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
      storedId: null,
    );
    expect(find.byType(AssistantEmptyHero), findsOneWidget);
    expect(
      find.byKey(const ValueKey('assistant-quick-actions')),
      findsOneWidget,
    );
    expect(find.byKey(_sidebar), findsNothing);
    expect(find.byKey(_recent), findsOneWidget);
    expect(find.text('Launch follow-up'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('assistant-quick-action-tasks')),
    );
    await tester.pump();
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      'Show my most urgent tasks',
    );

    // The end of the thread clears the floating composer.
    final position = tester
        .state<ScrollableState>(
          find.descendant(
            of: find.byType(CustomScrollView),
            matching: find.byType(Scrollable),
          ),
        )
        .position;
    position.jumpTo(position.maxScrollExtent);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('assistant-recent-see-all')));
    await tester.pumpAndSettle();
    expect(
      router.routeInformationProvider.value.uri.path,
      Routes.assistantConversations,
    );
    expect(find.byType(AssistantConversations), findsOneWidget);
  });

  // Tablets use the dock, so the body is the window; desktop keeps the
  // 240dp labelled shell sidebar.
  for (final (device, size, width) in [
    ('tablet', const Size(834, 1194), 280.0),
    ('desktop', const Size(1440, 900), 320.0),
  ]) {
    testWidgets('$device keeps history in a sidebar the action toggles', (
      tester,
    ) async {
      _size(tester, size);
      final router = await pumpAssistantShell(
        tester,
        repository: AssistantShellFixtureRepository(),
      );
      final sidebar = find.byKey(_sidebar);
      expect(sidebar, findsOneWidget);
      expect(tester.getSize(sidebar).width, width);
      expect(
        find.descendant(of: sidebar, matching: find.text('Launch follow-up')),
        findsOneWidget,
      );

      await tester.tap(find.byTooltip('Conversations'));
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.path, Routes.assistant);
      expect(sidebar, findsNothing);

      await tester.tap(find.byTooltip('Conversations'));
      await tester.pumpAndSettle();
      expect(sidebar, findsOneWidget);

      await tester.tap(
        find.byKey(const ValueKey('assistant-history-sidebar-all')),
      );
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.assistantConversations,
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('a collapsed sidebar returns recent chats to the new chat', (
    tester,
  ) async {
    _size(tester, const Size(1440, 900));
    await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
      storedId: null,
    );
    expect(find.byKey(_sidebar), findsOneWidget);
    expect(find.byKey(_recent), findsNothing);
    await tester.tap(find.byTooltip('Conversations'));
    await tester.pumpAndSettle();
    expect(find.byKey(_sidebar), findsNothing);
    expect(find.byKey(_recent), findsOneWidget);
  });

  testWidgets('landscape phones keep the Conversations page', (tester) async {
    // A landscape iPhone is wider than the sidebar threshold but still a
    // phone, with the notch on the leading edge.
    _size(tester, const Size(932, 430));
    tester.view
      ..padding = const FakeViewPadding(left: 59, right: 59, bottom: 21)
      ..viewPadding = const FakeViewPadding(left: 59, right: 59, bottom: 21);
    final router = await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
      storedId: null,
    );
    expect(find.byKey(_sidebar), findsNothing);
    expect(find.byKey(_recent), findsOneWidget);
    await tester.tap(find.byTooltip('Conversations'));
    await tester.pumpAndSettle();
    expect(
      router.routeInformationProvider.value.uri.path,
      Routes.assistantConversations,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('the sidebar takes the leading safe-area inset', (tester) async {
    _size(tester, const Size(834, 1194));
    tester.view
      ..padding = const FakeViewPadding(left: 24)
      ..viewPadding = const FakeViewPadding(left: 24);
    await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
      storedId: null,
    );
    final sidebar = tester.getRect(find.byKey(_sidebar));
    expect(sidebar.left, 24);
    expect(sidebar.width, 280);
    // The thread starts at the sidebar's edge rather than adding the inset
    // again.
    final slot = tester.getRect(
      find.byKey(const ValueKey('assistant-history-sidebar-slot')),
    );
    final actions = tester.getRect(
      find.byKey(const ValueKey('assistant-quick-actions')),
    );
    expect(slot.right, 304);
    expect(actions.left, greaterThan(slot.right));
    expect(actions.left, lessThan(slot.right + 64));
    expect(tester.takeException(), isNull);
  });
}
