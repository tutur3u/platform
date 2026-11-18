import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_action_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_size_reporter.dart';
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
    expect(find.text('Assistant'), findsOneWidget);
    expect(find.text('Mira'), findsWidgets);
    expect(
      tester.getTopLeft(action).dy,
      greaterThan(tester.getTopLeft(find.textContaining('next steps')).dy),
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
    await pumpAssistantShell(
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
    expect(row, findsNothing);
    expect(find.text('Launch follow-up'), findsOneWidget);
  });
}
