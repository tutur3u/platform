import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_panel.dart';
import 'package:mobile/features/assistant/widgets/assistant_history_sidebar.dart';
import 'package:mobile/features/assistant/widgets/assistant_quick_actions.dart';
import 'package:mobile/features/assistant/widgets/assistant_recent_conversations.dart';

import '../../../helpers/design_render_harness.dart';
import '../view/assistant_s5_shell_harness.dart';

const _sizes = {
  'phone': Size(390, 844),
  'phone-landscape': Size(932, 430),
  'tablet': Size(834, 1194),
  'desktop': Size(1440, 900),
};

/// Writes the real page's render boundary to `DESIGN_RENDER_DIR`.
Future<void> _capture(WidgetTester tester, String name) async {
  final output = DesignRender.outputDir;
  if (output == null) return;
  final ratio =
      double.tryParse(
        Platform.environment['DESIGN_RENDER_PIXEL_RATIO'] ?? '',
      ) ??
      1;
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(assistantBoundary),
    );
    final image = await boundary.toImage(pixelRatio: ratio);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('$output/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
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
  setUpAssistantShellHarness();

  // The real Mira page in the shell, on a new chat, at each window class.
  for (final MapEntry(key: device, value: size) in _sizes.entries) {
    for (final brightness in Brightness.values) {
      testWidgets('Mira home $device ${brightness.name}', (tester) async {
        DesignRender.setSize(tester, size);
        await pumpAssistantShell(
          tester,
          repository: AssistantShellFixtureRepository(),
          brightness: brightness,
          storedId: null,
        );
        expect(tester.takeException(), isNull);
        await _capture(tester, 'assistant-home-$device-${brightness.name}');

        // History sits beside the thread only on tablet-class windows.
        final wide = device == 'tablet' || device == 'desktop';
        expect(
          find.byKey(const ValueKey('assistant-history-sidebar')),
          wide ? findsOneWidget : findsNothing,
        );
        expect(
          find.byKey(const ValueKey('assistant-recent-conversations')),
          wide ? findsNothing : findsOneWidget,
        );

        // Four quick actions in a row from 600dp of grid width, otherwise
        // two rows of two.
        Rect tile(String id) =>
            tester.getRect(find.byKey(ValueKey('assistant-quick-action-$id')));
        final grid = tester.getRect(
          find.byKey(const ValueKey('assistant-quick-actions')),
        );
        expect(tile('tasks').top, tile('calendar').top);
        if (grid.width >= 600) {
          expect(tile('finance').top, tile('calendar').top);
        } else {
          expect(tile('focus').top, greaterThan(tile('calendar').bottom));
          expect(tile('focus').height, tile('tasks').height);
        }
        // Short windows scroll the home; bring the tile clear of the
        // composer before tapping it.
        final cardTop = tester
            .getRect(
              find.descendant(
                of: find.byType(AssistantComposerPanel),
                matching: find.byType(AppCard),
              ),
            )
            .top;
        final overlap = tile('calendar').bottom - cardTop;
        if (overlap > 0) {
          final position = tester
              .state<ScrollableState>(
                find.descendant(
                  of: find.byType(CustomScrollView),
                  matching: find.byType(Scrollable),
                ),
              )
              .position;
          position.jumpTo(position.pixels + overlap + AppSpacing.sm);
          await tester.pump();
        }
        expect(tile('calendar').bottom, lessThanOrEqualTo(cardTop));
        await tester.tap(
          find.byKey(const ValueKey('assistant-quick-action-calendar')),
        );
        await tester.pump();
        expect(
          tester.widget<TextField>(find.byType(TextField)).controller?.text,
          'Summarize my calendar for today',
        );

        // One prompt surface: no starter chips, only the model control, and
        // no response-mode chip whatever mode a restored chat carries.
        expect(
          find.byKey(const ValueKey('assistant-starter-prompts')),
          findsNothing,
        );
        expect(
          find.byKey(const ValueKey('assistant-composer-model')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('assistant-composer-mode')),
          findsNothing,
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
        expect(tester.takeException(), isNull);
      });
    }
  }

  // Component states rendered on their own.
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
