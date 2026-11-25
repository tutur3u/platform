import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/assistant/widgets/assistant_conversations.dart';
import 'package:mobile/features/assistant/widgets/assistant_empty_hero.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior_cubit.dart';

import '../../../helpers/fake_sidebar_preferences.dart';
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
  useFakeSidebarPreferences();

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

  for (final direction in TextDirection.values) {
    testWidgets('the sidebar takes the leading inset (${direction.name})', (
      tester,
    ) async {
      // A dock-mode tablet whose body, after a 12dp leading inset, still
      // fits the sidebar.
      _size(tester, const Size(834, 1194));
      final rtl = direction == TextDirection.rtl;
      final inset = rtl
          ? const FakeViewPadding(right: 12)
          : const FakeViewPadding(left: 12);
      tester.view
        ..padding = inset
        ..viewPadding = inset;
      await pumpAssistantShell(
        tester,
        repository: AssistantShellFixtureRepository(),
        storedId: null,
        textDirection: direction,
      );
      final sidebar = tester.getRect(find.byKey(_sidebar));
      final slot = tester.getRect(
        find.byKey(const ValueKey('assistant-history-sidebar-slot')),
      );
      final actions = tester.getRect(
        find.byKey(const ValueKey('assistant-quick-actions')),
      );
      expect(sidebar.width, 280);
      expect(slot.width, 292);
      if (rtl) {
        expect(sidebar.right, 834 - 12);
        expect(slot.left, 834 - 292);
        // The thread starts at the sidebar's edge without the inset again.
        expect(actions.right, lessThan(slot.left));
        expect(actions.right, greaterThan(slot.left - 64));
      } else {
        expect(sidebar.left, 12);
        expect(slot.right, 292);
        expect(actions.left, greaterThan(slot.right));
        expect(actions.left, lessThan(slot.right + 64));
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('an expanded rail leaves too little room for the sidebar', (
    tester,
  ) async {
    // A 1024dp landscape tablet fits the sidebar beside the collapsed rail
    // but not beside the 240dp expanded one.
    _size(tester, const Size(1024, 768));
    await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
      storedId: null,
    );
    expect(find.byKey(_sidebar), findsOneWidget);
    final behavior = BlocProvider.of<SidebarBehaviorCubit>(
      tester.element(find.byType(AssistantEmptyHero)),
    );
    await behavior.setBehavior(SidebarBehavior.expanded);
    await tester.pumpAndSettle();
    expect(find.byKey(_sidebar), findsNothing);
    expect(find.byKey(_recent), findsOneWidget);
    // The history action opens the Conversations page instead.
    await tester.tap(find.byTooltip('Conversations'));
    await tester.pumpAndSettle();
    expect(find.byType(AssistantConversations), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('toggling the sidebar keeps the thread mounted', (tester) async {
    _size(tester, const Size(1440, 900));
    await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository()..longTranscript = true,
    );
    ScrollableState thread() => tester.state<ScrollableState>(
      find.descendant(
        of: find.byType(CustomScrollView),
        matching: find.byType(Scrollable),
      ),
    );
    final before = thread();
    final field = find.byType(TextField);
    await tester.enterText(field, 'Draft kept across the toggle');
    await tester.pump();
    final editable = tester.state<EditableTextState>(find.byType(EditableText));

    await tester.tap(find.byTooltip('Conversations'));
    await tester.pumpAndSettle();
    expect(find.byKey(_sidebar), findsNothing);
    expect(identical(thread(), before), isTrue);
    expect(
      identical(
        tester.state<EditableTextState>(find.byType(EditableText)),
        editable,
      ),
      isTrue,
    );
    expect(
      tester.widget<TextField>(field).controller?.text,
      'Draft kept across the toggle',
    );

    await tester.tap(find.byTooltip('Conversations'));
    await tester.pumpAndSettle();
    expect(find.byKey(_sidebar), findsOneWidget);
    expect(identical(thread(), before), isTrue);
    expect(tester.takeException(), isNull);
  });
}
