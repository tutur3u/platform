import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_action_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_size_reporter.dart';
import 'package:mobile/features/assistant/widgets/assistant_conversation_row.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';

import 'assistant_s5_shell_harness.dart';

void main() {
  setUpAssistantShellHarness();

  testWidgets('composer clears the dock and follows the keyboard', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1
      ..padding = const FakeViewPadding(bottom: 34)
      ..viewPadding = const FakeViewPadding(bottom: 34);
    addTearDown(tester.view.reset);
    await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
    );

    final composer = find.byType(AssistantComposerSizeReporter);
    final dock = find.byType(FloatingShellDock);
    final action = find.byType(AssistantCompletedActionCard);
    expect(find.byKey(const ValueKey('assistant-name-title')), findsOneWidget);
    expect(find.text('Mira'), findsWidgets);
    expect(
      tester.getTopLeft(action).dy,
      lessThan(tester.getTopLeft(find.textContaining('next steps')).dy),
    );
    expect(find.byType(AssistantTranscriptBubble), findsNWidgets(2));
    final shell = tester.widget<FloatingShellDock>(dock);
    expect(
      tester.getBottomLeft(composer).dy,
      closeTo(tester.getBottomLeft(dock).dy - shell.bottomInset - 34, 1),
    );

    final transcriptPadding = tester
        .widget<SliverPadding>(
          find
              .descendant(
                of: find.byType(CustomScrollView),
                matching: find.byType(SliverPadding),
              )
              .first,
        )
        .padding
        .resolve(TextDirection.ltr);
    expect(
      transcriptPadding.bottom,
      closeTo(shell.bottomInset + 34 + tester.getSize(composer).height + 12, 1),
    );

    await tester.tap(find.byKey(const ValueKey('assistant-composer-editor')));
    tester.view
      ..padding = FakeViewPadding.zero
      ..viewInsets = const FakeViewPadding(bottom: 305);
    await tester.pumpAndSettle();
    expect(tester.getBottomLeft(composer).dy, closeTo(844 - 305, 1));
    final opacity = find.byKey(const ValueKey('floating-shell-dock-opacity'));
    expect(tester.widget<AnimatedOpacity>(opacity).opacity, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('dock Back returns to the same draft after searching history', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final router = await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository(),
    );
    await tester.enterText(find.byType(TextField), 'Launch update draft');
    await tester.tap(find.byTooltip('Conversations'));
    await tester.pumpAndSettle();
    expect(
      router.routeInformationProvider.value.uri.path,
      Routes.assistantConversations,
    );
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('This week'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'interview feedback');
    await tester.pumpAndSettle();
    expect(find.text('Team check-in notes'), findsOneWidget);
    expect(find.text('Launch follow-up'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('shell-dock-back')));
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.path, Routes.assistant);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      'Launch update draft',
    );
  });

  testWidgets('swiping an idle conversation archives only after confirmation', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final repository = AssistantShellFixtureRepository();
    final router = await pumpAssistantShell(
      tester,
      repository: repository,
      initialLocation: Routes.assistantConversations,
    );
    final row = find.byKey(const ValueKey('assistant-archive-$archiveId'));
    Future<void> swipe() async {
      await tester.drag(row, const Offset(-320, 0));
      await tester.pumpAndSettle();
      expect(find.text('Archive conversation?'), findsOneWidget);
      expect(repository.archived, isEmpty);
    }

    expect(find.byType(Dismissible), findsOneWidget);
    await swipe();
    await tester.tap(find.widgetWithText(AppButton, 'Cancel'));
    await tester.pumpAndSettle();
    expect(row, findsOneWidget);
    await swipe();
    await tester.tap(find.widgetWithText(AppButton, 'Archive'));
    await tester.pumpAndSettle();
    expect(repository.archived, [archiveId]);
    expect(repository.historyRequests, contains(true));
    expect(row, findsNothing);
    router.go(Routes.assistant);
    await tester.pumpAndSettle();
    router.go(Routes.assistantConversations);
    await tester.pumpAndSettle();
    expect(row, findsNothing);
    expect(find.text('Launch follow-up'), findsOneWidget);
  });

  testWidgets('cold Conversations link shows loading, offline, and retry', (
    tester,
  ) async {
    final gate = Completer<void>();
    final repository = AssistantShellFixtureRepository()
      ..historyGate = gate
      ..historyOffline = true
      ..historyFails = true;
    final router = await pumpAssistantShell(
      tester,
      repository: repository,
      initialLocation: Routes.assistantConversations,
    );
    expect(find.byType(AppSkeletonRows), findsOneWidget);
    expect(find.text('No conversations'), findsNothing);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Not available offline'), findsOneWidget);
    repository.historyOffline = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Could not load conversations'), findsOneWidget);
    repository.historyFails = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Launch follow-up'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.path, Routes.assistant);
  });

  for (final (language, militaryTime) in [
    ('en', false),
    ('en', true),
    ('vi', true),
  ]) {
    testWidgets('conversation dates use $language and 24-hour=$militaryTime', (
      tester,
    ) async {
      await pumpAssistantShell(
        tester,
        repository: AssistantShellFixtureRepository()..showWeekBoundary = true,
        initialLocation: Routes.assistantConversations,
        locale: Locale(language),
        alwaysUse24HourFormat: militaryTime,
      );
      expect(find.text(militaryTime ? '14:30' : '2:30 PM'), findsOneWidget);
      final sunday = find.ancestor(
        of: find.text('Sunday check-in'),
        matching: find.byType(AssistantConversationRow),
      );
      final row = tester.widget<AssistantConversationRow>(sunday);
      expect(
        row.period,
        language == 'en'
            ? AssistantConversationPeriod.thisWeek
            : AssistantConversationPeriod.earlier,
      );
    });
  }

  testWidgets('failed archive keeps the row and displays a toast', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final repository = AssistantShellFixtureRepository()..archiveFails = true;
    await pumpAssistantShell(
      tester,
      repository: repository,
      initialLocation: Routes.assistantConversations,
    );
    final row = find.byKey(const ValueKey('assistant-archive-$archiveId'));
    await tester.drag(row, const Offset(-320, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(AppButton, 'Archive'));
    await tester.pumpAndSettle();
    expect(find.text('Could not archive this conversation.'), findsOneWidget);
    expect(row, findsOneWidget);
    expect(repository.archived, isEmpty);
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets(
    'scroll hiding the dock preserves composer and transcript layout',
    (tester) async {
      tester.view
        ..physicalSize = const Size(390, 844)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await pumpAssistantShell(
        tester,
        repository: AssistantShellFixtureRepository()..longTranscript = true,
      );
      final composer = find.byType(AssistantComposerSizeReporter);
      final last = find.byType(AssistantTranscriptBubble).last;
      final scrollable = find.descendant(
        of: find.byType(CustomScrollView),
        matching: find.byType(Scrollable),
      );
      final position = tester.state<ScrollableState>(scrollable).position;
      final scrollView = find.byType(CustomScrollView);
      await tester.drag(scrollView, const Offset(0, 450));
      await tester.pumpAndSettle();
      position.jumpTo(position.maxScrollExtent - 360);
      await tester.pumpAndSettle();
      final start = position.pixels;
      final composerRect = tester.getRect(composer);
      final lastY = tester.getTopLeft(last).dy;
      final extent = position.maxScrollExtent;
      final gesture = await tester.startGesture(tester.getCenter(scrollView));
      await gesture.moveBy(const Offset(0, -40));
      await tester.pump();
      await gesture.moveBy(const Offset(0, -200));
      await tester.pumpAndSettle();
      expect(position.pixels, greaterThan(start + 24));
      expect(
        tester
            .widget<AnimatedOpacity>(
              find.byKey(const ValueKey('floating-shell-dock-opacity')),
            )
            .opacity,
        0,
      );
      expect(position.maxScrollExtent, extent);
      expect(tester.getRect(composer), composerRect);
      expect(
        tester.getTopLeft(last).dy + position.pixels,
        closeTo(lastY + start, 1),
      );
      await gesture.up();
      await tester.pumpAndSettle();
    },
  );

  testWidgets('configured name reaches the composer and Live opens from More', (
    tester,
  ) async {
    await pumpAssistantShell(
      tester,
      repository: AssistantShellFixtureRepository()..assistantName = 'Nova',
    );
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('assistant-name-title')),
        matching: find.text('Nova'),
      ),
      findsOneWidget,
    );
    expect(find.text('Ask Nova'), findsOneWidget);
    await tester.tap(
      find.byKey(const ValueKey('shell-action-button-assistant-more')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('assistant-more-live')));
    await tester.pumpAndSettle();
    expect(find.byType(AssistantLiveCallControls), findsOneWidget);
    expect(
      find.byKey(const ValueKey('assistant-composer-editor')),
      findsNothing,
    );
    await tester.tap(find.byKey(const ValueKey('live-control-keyboard')));
    await tester.pumpAndSettle();
    expect(find.text('Ask Nova'), findsOneWidget);
  });
}
