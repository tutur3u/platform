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
const ValueKey<String> _slot = ValueKey('assistant-history-sidebar-slot');
const ValueKey<String> _actions = ValueKey('assistant-quick-actions');

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

  // A portrait tablet's body sits beside the 80dp rail; desktop keeps the
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
    final rtl = direction == TextDirection.rtl;
    const inset12 = 12.0;
    void applyInset(WidgetTester tester) {
      final inset = rtl
          ? const FakeViewPadding(right: inset12)
          : const FakeViewPadding(left: inset12);
      tester.view
        ..padding = inset
        ..viewPadding = inset;
    }

    testWidgets('beside the rail the sidebar starts at its edge '
        '(${direction.name})', (tester) async {
      // An 834dp portrait tablet: the rail absorbs the leading inset.
      _size(tester, const Size(834, 1194));
      applyInset(tester);
      await pumpAssistantShell(
        tester,
        repository: AssistantShellFixtureRepository(),
        storedId: null,
        textDirection: direction,
      );
      final sidebar = tester.getRect(find.byKey(_sidebar));
      final slot = tester.getRect(find.byKey(_slot));
      final actions = tester.getRect(find.byKey(_actions));
      final rail = tester.getRect(
        find.byKey(const ValueKey('shell-navigation-rail')),
      );
      expect(sidebar.width, 280);
      expect(slot.width, 280);
      if (rtl) {
        expect(slot.right, rail.left);
        expect(sidebar.right, slot.right);
        expect(actions.right, lessThan(slot.left));
        expect(actions.right, greaterThan(slot.left - 64));
      } else {
        expect(slot.left, rail.right);
        expect(sidebar.left, slot.left);
        expect(actions.left, greaterThan(slot.right));
        expect(actions.left, lessThan(slot.right + 64));
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('in dock mode the sidebar takes the leading inset '
        '(${direction.name})', (tester) async {
      // A 760dp window keeps the dock; its 748dp body after the inset still
      // fits the sidebar, which takes the inset so its rows clear a notch.
      _size(tester, const Size(760, 1000));
      applyInset(tester);
      await pumpAssistantShell(
        tester,
        repository: AssistantShellFixtureRepository(),
        storedId: null,
        textDirection: direction,
      );
      expect(find.byKey(const ValueKey('shell-navigation-rail')), findsNothing);
      final sidebar = tester.getRect(find.byKey(_sidebar));
      final slot = tester.getRect(find.byKey(_slot));
      final actions = tester.getRect(find.byKey(_actions));
      expect(sidebar.width, 280);
      expect(slot.width, 280 + inset12);
      if (rtl) {
        expect(sidebar.right, 760 - inset12);
        expect(slot.left, 760 - 280 - inset12);
        // The thread starts at the sidebar's edge without the inset again.
        expect(actions.right, lessThan(slot.left));
        expect(actions.right, greaterThan(slot.left - 64));
      } else {
        expect(sidebar.left, inset12);
        expect(slot.right, 280 + inset12);
        expect(actions.left, greaterThan(slot.right));
        expect(actions.left, lessThan(slot.right + 64));
      }
      expect(tester.takeException(), isNull);
    });
  }

  // Beside the 80dp rail the sidebar needs a 720dp body: an 800dp window.
  for (final (size, shown) in [
    (const Size(768, 1024), false),
    (const Size(799, 1280), false),
    (const Size(800, 1280), true),
  ]) {
    testWidgets('a ${size.width.toInt()}dp portrait tablet '
        '${shown ? 'keeps the sidebar' : 'opens Conversations'}', (
      tester,
    ) async {
      _size(tester, size);
      final router = await pumpAssistantShell(
        tester,
        repository: AssistantShellFixtureRepository(),
        storedId: null,
      );
      expect(
        find.byKey(const ValueKey('shell-navigation-rail')),
        findsOneWidget,
      );
      expect(find.byKey(_sidebar), shown ? findsOneWidget : findsNothing);
      if (!shown) {
        await tester.tap(find.byTooltip('Conversations'));
        await tester.pumpAndSettle();
        expect(
          router.routeInformationProvider.value.uri.path,
          Routes.assistantConversations,
        );
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('an expanded rail leaves too little room for the sidebar', (
    tester,
  ) async {
    // A 940dp landscape window fits the sidebar beside the collapsed rail
    // (860dp body) but not beside the 240dp expanded one (700dp body).
    _size(tester, const Size(940, 700));
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
