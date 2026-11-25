import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_panel.dart';
import 'package:mobile/features/assistant/widgets/assistant_history_sidebar.dart';
import 'package:mobile/features/assistant/widgets/assistant_home_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_quick_actions.dart';
import 'package:mobile/features/assistant/widgets/assistant_recent_conversations.dart';

import '../../../helpers/design_render_harness.dart';

final _now = DateTime(2030, 4, 3, 9, 30);

final _history = [
  AssistantChatRecord(
    id: 'chat-1',
    title: 'Launch follow-up',
    preview: 'I drafted the next steps for the launch.',
    updatedAt: DateTime(2030, 4, 3, 8, 10),
  ),
  AssistantChatRecord(
    id: 'chat-2',
    title: 'Sprint planning for the April release',
    preview: 'A summary of this week’s priorities.',
    updatedAt: DateTime(2030, 4, 2, 11, 25),
  ),
  AssistantChatRecord(
    id: 'chat-3',
    title: 'Quarterly budget review',
    preview: 'Compare spending against the plan.',
    updatedAt: DateTime(2030, 3, 12, 16),
  ),
];

const _sizes = {
  'phone': Size(390, 844),
  'tablet': Size(834, 1194),
  'desktop': Size(1440, 900),
};

/// The Mira new-chat screen as the page composes it: history beside the
/// thread on wide windows, the home content, and the composer surface with
/// its prompts and model controls.
class _Scene extends StatelessWidget {
  const _Scene({required this.onPrompt, required this.onMode});

  final ValueChanged<String> onPrompt;
  final ValueChanged<AssistantThinkingMode> onMode;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final wide = constraints.maxWidth >= assistantHistorySidebarMinWidth;
      return Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (wide)
            SizedBox(
              width: assistantHistorySidebarWidth(constraints.maxWidth),
              child: AssistantHistorySidebar(
                history: _history,
                status: AssistantHistoryStatus.ready,
                activeChatId: 'chat-1',
                now: _now,
                topInset: AppSpacing.lg,
                onSelect: (_) {},
                onOpenAll: () {},
                onRetry: () async {},
              ),
            ),
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      AppSpacing.xxl,
                      AppSpacing.lg,
                      240,
                    ),
                    child: AssistantHomeView(
                      assistantName: 'Mira',
                      now: _now,
                      onPromptSelected: onPrompt,
                      recent: wide
                          ? null
                          : AssistantRecentConversations(
                              history: _history,
                              status: AssistantHistoryStatus.ready,
                              now: _now,
                              onSelect: (_) {},
                              onSeeAll: () {},
                              onRetry: () async {},
                            ),
                    ),
                  ),
                ),
                AssistantComposerPanel(
                  showSuggestions: false,
                  onPromptSelected: onPrompt,
                  onHeightChanged: (_) {},
                  controls: AssistantComposerControls(
                    shellState: const AssistantShellState(),
                    onOpenModels: null,
                    onThinkingModeChanged: (mode) async => onMode(mode),
                  ),
                  child: Builder(
                    builder: (context) =>
                        SizedBox(height: assistantComposerHeight(context)),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    },
  );
}

Future<void> _pump(WidgetTester tester, Widget child, Brightness b) async {
  final settings = DesignRender.themes[b.name]!.$1;
  await tester.pumpWidget(
    DesignRenderApp(settings: settings, brightness: b, child: child),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final MapEntry(key: device, value: size) in _sizes.entries) {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      testWidgets('Mira home $device ${brightness.name}', (tester) async {
        DesignRender.setSize(tester, size);
        final prompts = <String>[];
        final modes = <AssistantThinkingMode>[];
        await _pump(
          tester,
          _Scene(onPrompt: prompts.add, onMode: modes.add),
          brightness,
        );
        expect(tester.takeException(), isNull);
        await DesignRender.capture(
          tester,
          'assistant-home-$device-${brightness.name}',
        );

        final wide = device != 'phone';
        expect(
          find.byKey(const ValueKey('assistant-history-sidebar')),
          wide ? findsOneWidget : findsNothing,
        );
        expect(
          find.byKey(const ValueKey('assistant-recent-conversations')),
          wide ? findsNothing : findsOneWidget,
        );

        Rect tile(String id) =>
            tester.getRect(find.byKey(ValueKey('assistant-quick-action-$id')));
        expect(tile('tasks').top, tile('calendar').top);
        if (device == 'desktop') {
          expect(tile('finance').top, tile('calendar').top);
        } else {
          expect(tile('focus').top, greaterThan(tile('calendar').bottom));
        }

        await tester.tap(
          find.byKey(const ValueKey('assistant-quick-action-calendar')),
        );
        expect(prompts.last, 'Summarize my calendar for today');
        expect(
          find.byKey(const ValueKey('assistant-starter-prompts')),
          findsNothing,
        );
        // The outline paints over the card fill so it stays visible.
        final outline = tester.widget<DecoratedBox>(
          find.byKey(const ValueKey('assistant-composer-outline')),
        );
        expect(outline.position, DecorationPosition.foreground);
        final colors = AppTokens.of(
          tester.element(find.byType(AssistantComposerPanel)),
        ).colorScheme;
        expect(
          ((outline.decoration as BoxDecoration).border! as Border).top.color,
          brightness == Brightness.dark
              ? colors.mutedForeground.withValues(alpha: 0.4)
              : colors.border,
        );

        final composer = tester.getRect(
          find.descendant(
            of: find.byType(AssistantComposerPanel),
            matching: find.byType(AppCard),
          ),
        );
        final controls = tester.getRect(
          find.byKey(const ValueKey('assistant-composer-controls')),
        );
        expect(controls.bottom, lessThanOrEqualTo(composer.bottom));
        await tester.tap(find.byKey(const ValueKey('assistant-composer-mode')));
        expect(modes, [AssistantThinkingMode.fast]);
        expect(tester.takeException(), isNull);
      });
    }
  }

  group('history states', () {
    Widget sidebar(AssistantHistoryStatus status, Future<void> Function() r) =>
        SizedBox(
          width: 280,
          child: AssistantHistorySidebar(
            history: const [],
            status: status,
            topInset: 0,
            onSelect: (_) {},
            onOpenAll: () {},
            onRetry: r,
          ),
        );

    testWidgets('sidebar shows loading, empty and retryable failure', (
      tester,
    ) async {
      DesignRender.setSize(tester, _sizes['tablet']!);
      var retries = 0;
      Future<void> retry() async {
        retries++;
      }

      await _pump(
        tester,
        sidebar(AssistantHistoryStatus.loading, retry),
        Brightness.light,
      );
      expect(find.byType(AppSkeletonRows), findsOneWidget);

      await _pump(
        tester,
        sidebar(AssistantHistoryStatus.ready, retry),
        Brightness.light,
      );
      expect(
        find.text('No chats yet. Start a new conversation to create one.'),
        findsOneWidget,
      );

      await _pump(
        tester,
        sidebar(AssistantHistoryStatus.failed, retry),
        Brightness.dark,
      );
      expect(find.text('Could not load conversations'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      expect(retries, 1);
      await DesignRender.capture(tester, 'assistant-history-sidebar-failed');
    });

    testWidgets('recent conversations hide once history loads empty', (
      tester,
    ) async {
      DesignRender.setSize(tester, _sizes['phone']!);
      Widget recent(AssistantHistoryStatus status) =>
          AssistantRecentConversations(
            history: const [],
            status: status,
            onSelect: (_) {},
            onSeeAll: () {},
            onRetry: () async {},
          );
      await _pump(
        tester,
        recent(AssistantHistoryStatus.ready),
        Brightness.light,
      );
      expect(
        find.byKey(const ValueKey('assistant-recent-conversations')),
        findsNothing,
      );
      await _pump(
        tester,
        recent(AssistantHistoryStatus.loading),
        Brightness.light,
      );
      expect(find.byType(AppSkeletonRows), findsOneWidget);
      await _pump(
        tester,
        recent(AssistantHistoryStatus.offline),
        Brightness.light,
      );
      expect(find.text('Not available offline'), findsOneWidget);
    });
  });

  testWidgets('quick actions tolerate a slot narrower than their gaps', (
    tester,
  ) async {
    DesignRender.setSize(tester, _sizes['phone']!);
    await _pump(
      tester,
      Align(
        alignment: Alignment.topLeft,
        child: SizedBox(
          width: 2,
          child: AssistantQuickActionGrid(onSelected: (_) {}),
        ),
      ),
      Brightness.light,
    );
    expect(
      tester.getSize(find.byKey(const ValueKey('assistant-quick-actions'))),
      isNotNull,
    );
    // Narrow tiles may clip their content; only the layout must hold.
    final errors = <Object>[];
    Object? error;
    while ((error = tester.takeException()) != null) {
      errors.add(error!);
    }
    expect(
      errors.whereType<FlutterError>().where(
        (e) => e.toString().contains('negative'),
      ),
      isEmpty,
    );
  });
}
